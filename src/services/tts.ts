// =============================================================================
// Thai TTS (Text-to-Speech) support — vox-cpm.bmscloud.in.th
//
// The TTS server is OpenAI-speech-compatible but UNAUTHENTICATED — no Bearer
// is required or accepted. These helpers wrap the public endpoints and
// surface failures through the shared notification system so the UX is
// consistent with the BMS / LLM helpers.
//
// Audio is always returned as a complete binary payload (no streaming). For
// UI playback, use `playSpeech(...)` which wraps `synthesizeSpeech` plus an
// HTMLAudioElement and returns a handle you can use to pause/stop.
// =============================================================================

import type {
  TtsHealthStatus,
  TtsModelInfo,
  TtsNormalizeResult,
  TtsResponseFormat,
  TtsSynthesisOptions,
  TtsSynthesisResult,
  TtsVoiceInfo,
} from '@/types';
import { notifyError, notifyWarning } from '@/services/notify';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Base URL of the public TTS service. */
export const TTS_API_BASE = 'https://vox-cpm.bmscloud.in.th';

/** Default model id used when the caller does not specify one. */
export const DEFAULT_TTS_MODEL = 'voxcpm-thai';

/** Default voice — model's native voice, no cloning. */
export const DEFAULT_TTS_VOICE = 'default';

/** Default output format. */
export const DEFAULT_TTS_FORMAT: TtsResponseFormat = 'wav';

/**
 * Upper bound on `input` length. The server default is 4096 chars (configurable
 * via the server's MAX_TEXT_LENGTH env var). Callers should pre-chunk long
 * content — the server returns an error when exceeded.
 */
export const MAX_TTS_TEXT_LENGTH = 4096;

/**
 * Synthesis timeout (ms). TTS is CPU-bound on the server; 120 s gives large
 * inputs (near the 4096-char ceiling) room to finish without hanging the UI
 * forever on a stuck request.
 */
export const TTS_TIMEOUT_MS = 120_000;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function normaliseTtsError(error: unknown, timeoutSec: number): Error {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new Error(`TTS request timed out after ${timeoutSec}s`, {
      cause: error,
    });
  }
  if (error instanceof Error) return error;
  return new Error('Unable to reach TTS service. Please check your connection.', {
    cause: error,
  });
}

function notifyTtsFailure(context: string, err: Error): void {
  if (err.message.startsWith('มีการร้องขอบ่อยเกินไป')) {
    notifyWarning(err.message);
    return;
  }
  notifyError(`${context}: ${err.message}`);
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      detail?: unknown;
      error?: { message?: string } | string;
      message?: string;
    };
    if (typeof body.detail === 'string') return body.detail;
    if (body.detail) return JSON.stringify(body.detail);
    if (typeof body.error === 'string') return body.error;
    if (body.error && typeof body.error === 'object' && body.error.message) {
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

async function throwForHttpStatus(response: Response, context: string): Promise<never> {
  if (response.status === 429) {
    throw new Error(
      'มีการร้องขอบ่อยเกินไป (HTTP 429). กรุณารอสักครู่แล้วลองใหม่อีกครั้ง',
    );
  }
  const msg = await readErrorBody(response);
  throw new Error(`${context} (HTTP ${response.status}): ${msg}`);
}

/**
 * Wire the caller's optional AbortSignal into an internal timeout controller
 * so either an external abort or the timeout cancels the fetch.
 */
function makeAbortController(userSignal?: AbortSignal): {
  controller: AbortController;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const onUserAbort = () => controller.abort();
  if (userSignal) {
    if (userSignal.aborted) controller.abort();
    else userSignal.addEventListener('abort', onUserAbort);
  }
  const timeoutId = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);
  return {
    controller,
    cleanup: () => {
      clearTimeout(timeoutId);
      if (userSignal) userSignal.removeEventListener('abort', onUserAbort);
    },
  };
}

// ---------------------------------------------------------------------------
// Speech synthesis — POST /v1/audio/speech → audio Blob
// ---------------------------------------------------------------------------

/**
 * Synthesize Thai speech from text and return the raw audio payload.
 *
 * @param text   Text to speak. 1 – {@link MAX_TTS_TEXT_LENGTH} characters.
 * @param options  Optional model / voice / format / abort signal.
 * @throws {Error} On empty/oversized text, HTTP errors, network failures, or timeout.
 *
 * @example
 *   const { blob, format } = await synthesizeSpeech('สวัสดีครับ')
 *   const url = URL.createObjectURL(blob)
 *   new Audio(url).play()
 */
export async function synthesizeSpeech(
  text: string,
  options: TtsSynthesisOptions = {},
): Promise<TtsSynthesisResult> {
  const trimmed = text?.trim() ?? '';
  if (!trimmed) {
    throw new Error('TTS input is empty. Provide some text to synthesize.');
  }
  if (trimmed.length > MAX_TTS_TEXT_LENGTH) {
    throw new Error(
      `TTS input exceeds ${MAX_TTS_TEXT_LENGTH} characters (got ${trimmed.length}). ` +
        'Chunk long content across multiple calls.',
    );
  }

  const format: TtsResponseFormat = options.response_format ?? DEFAULT_TTS_FORMAT;
  const { controller, cleanup } = makeAbortController(options.signal);

  try {
    const response = await fetch(`${TTS_API_BASE}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: trimmed,
        model: options.model ?? DEFAULT_TTS_MODEL,
        voice: options.voice ?? DEFAULT_TTS_VOICE,
        response_format: format,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      await throwForHttpStatus(response, 'TTS synthesis failed');
    }

    const blob = await response.blob();
    const contentType = response.headers.get('Content-Type') ?? (format === 'mp3' ? 'audio/mpeg' : 'audio/wav');
    return { blob, contentType, format };
  } catch (error: unknown) {
    const finalErr = normaliseTtsError(error, TTS_TIMEOUT_MS / 1000);
    notifyTtsFailure('TTS', finalErr);
    throw finalErr;
  } finally {
    cleanup();
  }
}

// ---------------------------------------------------------------------------
// Play helper — synthesize + play via HTMLAudioElement
// ---------------------------------------------------------------------------

/** Handle returned by `playSpeech` — use it to stop playback or wait for end. */
export interface TtsPlayback {
  /** The HTMLAudioElement driving playback (already `.play()`-ed). */
  audio: HTMLAudioElement;
  /** Blob URL used as the audio src — revoked automatically on `stop()`/`ended`. */
  url: string;
  /** Resolves when the audio finishes (or rejects if the element errors). */
  ended: Promise<void>;
  /** Stop playback and release the Blob URL. Safe to call repeatedly. */
  stop: () => void;
}

/**
 * Synthesize `text` and immediately play it back via a fresh
 * `HTMLAudioElement`. Resolves once playback actually starts. Use the
 * returned `ended` promise to await completion.
 */
export async function playSpeech(
  text: string,
  options: TtsSynthesisOptions = {},
): Promise<TtsPlayback> {
  const { blob } = await synthesizeSpeech(text, options);
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);

  let stopped = false;
  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch {
      /* ignore */
    }
    URL.revokeObjectURL(url);
  };

  const ended = new Promise<void>((resolve, reject) => {
    audio.addEventListener('ended', () => {
      URL.revokeObjectURL(url);
      stopped = true;
      resolve();
    });
    audio.addEventListener('error', () => {
      URL.revokeObjectURL(url);
      stopped = true;
      const err = new Error('Audio playback failed.');
      notifyError(`TTS: ${err.message}`);
      reject(err);
    });
  });

  try {
    await audio.play();
  } catch (err) {
    stop();
    const msg = err instanceof Error ? err.message : String(err);
    notifyError(`TTS: unable to start playback — ${msg}`);
    throw new Error(`TTS playback failed to start: ${msg}`);
  }

  return { audio, url, ended, stop };
}

// ---------------------------------------------------------------------------
// Voice / model / health / normalize — public GET & POST endpoints
// ---------------------------------------------------------------------------

/** List available voice presets from `/v1/voices`. */
export async function listTtsVoices(): Promise<TtsVoiceInfo[]> {
  try {
    const response = await fetch(`${TTS_API_BASE}/v1/voices`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      await throwForHttpStatus(response, 'TTS voice listing failed');
    }
    const body = (await response.json()) as { voices?: TtsVoiceInfo[] };
    return Array.isArray(body.voices) ? body.voices : [];
  } catch (error: unknown) {
    const finalErr = normaliseTtsError(error, TTS_TIMEOUT_MS / 1000);
    notifyTtsFailure('TTS voices', finalErr);
    throw finalErr;
  }
}

/** List available models from the TTS server's `/v1/models`. */
export async function listTtsModels(): Promise<TtsModelInfo[]> {
  try {
    const response = await fetch(`${TTS_API_BASE}/v1/models`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      await throwForHttpStatus(response, 'TTS model listing failed');
    }
    const body = (await response.json()) as { data?: TtsModelInfo[] };
    return Array.isArray(body.data) ? body.data : [];
  } catch (error: unknown) {
    const finalErr = normaliseTtsError(error, TTS_TIMEOUT_MS / 1000);
    notifyTtsFailure('TTS models', finalErr);
    throw finalErr;
  }
}

/** Query `/health` for server readiness + sample rate. */
export async function checkTtsHealth(): Promise<TtsHealthStatus> {
  try {
    const response = await fetch(`${TTS_API_BASE}/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      await throwForHttpStatus(response, 'TTS health check failed');
    }
    return (await response.json()) as TtsHealthStatus;
  } catch (error: unknown) {
    const finalErr = normaliseTtsError(error, TTS_TIMEOUT_MS / 1000);
    notifyTtsFailure('TTS health', finalErr);
    throw finalErr;
  }
}

/**
 * Preview the Thai text normalization pipeline without synthesizing audio.
 * Useful for debugging how abbreviations / numbers / loanwords will be read.
 */
export async function normalizeThaiText(text: string): Promise<TtsNormalizeResult> {
  if (!text?.trim()) {
    throw new Error('TTS normalize: text is empty.');
  }
  try {
    const response = await fetch(`${TTS_API_BASE}/v1/text/normalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) {
      await throwForHttpStatus(response, 'TTS text normalization failed');
    }
    return (await response.json()) as TtsNormalizeResult;
  } catch (error: unknown) {
    const finalErr = normaliseTtsError(error, TTS_TIMEOUT_MS / 1000);
    notifyTtsFailure('TTS normalize', finalErr);
    throw finalErr;
  }
}
