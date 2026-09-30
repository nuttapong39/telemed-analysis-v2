// =============================================================================
// BMS-auth LLM API support — ai-api.kube.bmscloud.in.th
//
// Wraps the proxy's OpenAI-chat-completions endpoint with:
//   - Bearer = the BMS session id (NOT bms_session_code — different auth path
//     from /api/sql et al.; the proxy validates the session id against BMS)
//   - Sync (`callLlm`) and streaming (`streamLlm`) variants
//   - Unauthenticated model discovery (`listLlmModels`)
//   - User-visible toasts on failure via notifyApiFailure (matches the rest
//     of the service layer's error UX)
//
// The session id is read from the active-session singleton so stale closures
// auto-heal after a reconnect, matching /api/sql / /api/rest semantics.
// =============================================================================

import type {
  LlmChatMessage,
  LlmChatOptions,
  LlmChatResponse,
  LlmModel,
  LlmUsage,
} from '@/types';
import { getActiveSessionId } from '@/services/activeSession';
import { notifyError, notifyWarning } from '@/services/notify';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default base URL for the BMS-auth LLM proxy. */
export const LLM_API_BASE = 'https://ai-api.kube.bmscloud.in.th';

/** Default model id used when the caller does not specify one. */
export const DEFAULT_LLM_MODEL = 'qwen3.6';

/** Default max_tokens ceiling the proxy documents. */
export const DEFAULT_LLM_MAX_TOKENS = 8192;

/**
 * Request timeout (ms). The proxy's upstream nginx has a 300s read/send
 * ceiling, so we pick a value slightly under that to surface a clean timeout
 * error before the upstream cuts the connection.
 */
export const LLM_TIMEOUT_MS = 290_000;

// ---------------------------------------------------------------------------
// Shared utilities
// ---------------------------------------------------------------------------

interface OpenAiCompletionChoice {
  index?: number;
  finish_reason?: string | null;
  message?: { role?: string; content?: string };
}

interface OpenAiCompletion {
  id?: string;
  object?: string;
  model?: string;
  choices?: OpenAiCompletionChoice[];
  usage?: LlmUsage;
}

interface OpenAiStreamDelta {
  role?: string;
  content?: string;
}

interface OpenAiStreamChoice {
  index?: number;
  delta?: OpenAiStreamDelta;
  finish_reason?: string | null;
}

interface OpenAiStreamChunk {
  id?: string;
  object?: string;
  model?: string;
  choices?: OpenAiStreamChoice[];
}

/** Resolve the BMS session id that the LLM proxy expects as its Bearer token. */
function requireSessionId(): string {
  const sid = getActiveSessionId();
  if (!sid) {
    throw new Error(
      'LLM call requires an active BMS session. Connect a session before calling the LLM API.',
    );
  }
  return sid;
}

/**
 * Narrow a thrown error into a final Error, matching bmsSession.ts' pattern.
 * Keeps Session/timeout-specific error messages intact and wraps everything
 * else in a "Unable to reach LLM API" message with the cause preserved.
 */
function normaliseLlmError(error: unknown, timeoutSec: number): Error {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new Error(`LLM call timed out after ${timeoutSec}s`, { cause: error });
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error('Unable to reach LLM API. Please check your connection.', {
    cause: error,
  });
}

/** Toast policy for LLM failures — session expiry is handled elsewhere. */
function notifyLlmFailure(context: string, err: Error): void {
  if (err.message.startsWith('Session unauthorized')) {
    return;
  }
  if (err.message.startsWith('มีการร้องขอบ่อยเกินไป')) {
    notifyWarning(err.message);
    return;
  }
  notifyError(`${context}: ${err.message}`);
}

/**
 * Extract a readable message from a non-ok Response. The proxy may emit
 * structured errors (`{ error: { message, type } }`) or raw text; we try both.
 */
async function readErrorBody(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: { message?: string; type?: string; code?: string };
      message?: string;
    };
    if (body.error?.message) {
      return body.error.message;
    }
    if (body.message) return body.message;
    return JSON.stringify(body);
  } catch {
    try {
      const text = await response.text();
      if (text) return text.slice(0, 500);
    } catch {
      /* ignore */
    }
  }
  return `HTTP ${response.status}`;
}

/**
 * Map HTTP status codes from the LLM proxy to specific, actionable errors
 * that match the rest of the BMS service layer's error vocabulary.
 */
async function throwForHttpStatus(response: Response): Promise<never> {
  if (response.status === 401) {
    throw new Error(
      'Session unauthorized. Please reconnect with a valid session ID.',
    );
  }
  if (response.status === 400) {
    const msg = await readErrorBody(response);
    throw new Error(`LLM API bad request: ${msg}`);
  }
  if (response.status === 429) {
    throw new Error(
      'มีการร้องขอบ่อยเกินไป (HTTP 429). กรุณารอสักครู่แล้วลองใหม่อีกครั้ง',
    );
  }
  if (response.status === 502 || response.status === 503 || response.status === 504) {
    const msg = await readErrorBody(response);
    throw new Error(`LLM API upstream error (HTTP ${response.status}): ${msg}`);
  }
  const msg = await readErrorBody(response);
  throw new Error(`LLM API returned HTTP ${response.status}: ${msg}`);
}

// ---------------------------------------------------------------------------
// Non-streaming chat completion — Promise<LlmChatResponse>
// ---------------------------------------------------------------------------

/**
 * Execute a synchronous (non-streaming) chat completion. Returns the
 * accumulated assistant message plus usage accounting.
 *
 * @example
 *   const res = await callLlm([
 *     { role: 'system', content: 'You are a clinical documentation assistant.' },
 *     { role: 'user', content: 'Summarise this lab panel: ...' },
 *   ], { model: 'gemma4' });
 *   console.log(res.content);
 */
export async function callLlm(
  messages: LlmChatMessage[],
  options: LlmChatOptions = {},
): Promise<LlmChatResponse> {
  const sessionId = requireSessionId();
  const controller = new AbortController();
  const userSignal = options.signal;
  if (userSignal) {
    if (userSignal.aborted) controller.abort();
    else userSignal.addEventListener('abort', () => controller.abort());
  }
  const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

  try {
    const body = {
      model: options.model ?? DEFAULT_LLM_MODEL,
      messages,
      stream: false,
      max_tokens: options.max_tokens ?? DEFAULT_LLM_MAX_TOKENS,
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      ...(options.top_p !== undefined ? { top_p: options.top_p } : {}),
    };

    const response = await fetch(`${LLM_API_BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sessionId}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      await throwForHttpStatus(response);
    }

    const completion = (await response.json()) as OpenAiCompletion;
    const choice = completion.choices?.[0];
    const content = choice?.message?.content ?? '';

    return {
      id: completion.id ?? '',
      model: completion.model ?? (options.model ?? DEFAULT_LLM_MODEL),
      content,
      finishReason: choice?.finish_reason ?? null,
      usage: completion.usage,
    };
  } catch (error: unknown) {
    const finalErr = normaliseLlmError(error, LLM_TIMEOUT_MS / 1000);
    notifyLlmFailure(`LLM (${options.model ?? DEFAULT_LLM_MODEL})`, finalErr);
    throw finalErr;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Streaming chat completion — SSE → onDelta callbacks
// ---------------------------------------------------------------------------

export interface StreamLlmOptions extends LlmChatOptions {
  /** Called for each incremental content delta as it arrives. */
  onDelta: (deltaText: string) => void;
}

/**
 * Execute a streaming chat completion. Each incremental content chunk is
 * passed to `onDelta`; the returned promise resolves with the accumulated
 * content and metadata once the server emits `[DONE]` or closes the stream.
 *
 * Streaming responses do NOT include token usage (`usage` will be undefined).
 */
export async function streamLlm(
  messages: LlmChatMessage[],
  options: StreamLlmOptions,
): Promise<LlmChatResponse> {
  const sessionId = requireSessionId();
  const controller = new AbortController();
  const userSignal = options.signal;
  if (userSignal) {
    if (userSignal.aborted) controller.abort();
    else userSignal.addEventListener('abort', () => controller.abort());
  }
  const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

  try {
    const body = {
      model: options.model ?? DEFAULT_LLM_MODEL,
      messages,
      stream: true,
      max_tokens: options.max_tokens ?? DEFAULT_LLM_MAX_TOKENS,
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      ...(options.top_p !== undefined ? { top_p: options.top_p } : {}),
    };

    const response = await fetch(`${LLM_API_BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sessionId}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      await throwForHttpStatus(response);
    }

    if (!response.body) {
      throw new Error('LLM API returned a streaming response with no body.');
    }

    let completionId = '';
    let reportedModel = options.model ?? DEFAULT_LLM_MODEL;
    let finishReason: string | null = null;
    let accumulated = '';

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffered = '';

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });

        // SSE frames are separated by \n\n; each frame may carry `data:` lines.
        let sep: number;
        while ((sep = buffered.indexOf('\n\n')) !== -1) {
          const rawFrame = buffered.slice(0, sep);
          buffered = buffered.slice(sep + 2);
          const dataLines = rawFrame
            .split('\n')
            .filter((l) => l.startsWith('data:'))
            .map((l) => l.slice(5).trim());
          for (const payload of dataLines) {
            if (!payload) continue;
            if (payload === '[DONE]') {
              // End marker — drain outer loop; finishReason may already be set.
              return {
                id: completionId,
                model: reportedModel,
                content: accumulated,
                finishReason,
              };
            }
            try {
              const chunk = JSON.parse(payload) as OpenAiStreamChunk;
              if (chunk.id) completionId = chunk.id;
              if (chunk.model) reportedModel = chunk.model;
              const choice = chunk.choices?.[0];
              const text = choice?.delta?.content ?? '';
              if (text) {
                accumulated += text;
                options.onDelta(text);
              }
              if (choice?.finish_reason) {
                finishReason = choice.finish_reason;
              }
            } catch {
              // Skip malformed frames — the proxy may emit keep-alive noise.
            }
          }
        }
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        /* ignore */
      }
    }

    return {
      id: completionId,
      model: reportedModel,
      content: accumulated,
      finishReason,
    };
  } catch (error: unknown) {
    const finalErr = normaliseLlmError(error, LLM_TIMEOUT_MS / 1000);
    notifyLlmFailure(`LLM stream (${options.model ?? DEFAULT_LLM_MODEL})`, finalErr);
    throw finalErr;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Model discovery
// ---------------------------------------------------------------------------

/**
 * Fetch the catalog of available LLM model ids from `/v1/models`.
 *
 * This endpoint is intentionally public — no Bearer required — because the
 * proxy treats it as metadata. Callers typically use the returned ids as
 * hints for populating a model picker in the UI.
 */
export async function listLlmModels(): Promise<LlmModel[]> {
  try {
    const response = await fetch(`${LLM_API_BASE}/v1/models`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      const msg = await readErrorBody(response);
      throw new Error(`LLM model listing failed (HTTP ${response.status}): ${msg}`);
    }
    const body = (await response.json()) as {
      object?: string;
      data?: LlmModel[];
    };
    return Array.isArray(body.data) ? body.data : [];
  } catch (error: unknown) {
    const finalErr = normaliseLlmError(error, LLM_TIMEOUT_MS / 1000);
    notifyLlmFailure('LLM models', finalErr);
    throw finalErr;
  }
}
