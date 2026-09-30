// =============================================================================
// Thai ASR (Automatic Speech Recognition) support — asr1.bmscloud.in.th
//
// Wraps the public Typhoon-ASR backend. The server exposes three transcription
// endpoints:
//   - /v1/audio/transcriptions — OpenAI-Whisper-compatible (language, prompt,
//     response_format, temperature, timestamp_granularities). Default choice.
//   - /transcribe                — Typhoon-native, minimal fields (file, device).
//   - /transcribe-with-timestamps — Typhoon-native with segment timestamps.
//
// Plus a `/health` probe. No authentication.
//
// This module also ships MediaRecorder helpers so callers can capture from
// the microphone and feed the Blob straight into `transcribeAudio`.
// =============================================================================

import type {
  AsrHealthStatus,
  AsrSegment,
  AsrTranscriptionOptions,
  AsrTranscriptionResult,
  AsrWord,
  TyphoonTranscribeOptions,
} from '@/types';
import { notifyError, notifyWarning } from '@/services/notify';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Base URL of the public ASR service. */
export const ASR_API_BASE = 'https://asr1.bmscloud.in.th';

/** Default model id advertised in the server's OpenAPI spec. */
export const DEFAULT_ASR_MODEL = 'typhoon-asr-realtime';

/** Default language code — the server defaults to Thai. */
export const DEFAULT_ASR_LANGUAGE = 'th';

/**
 * Transcription timeout (ms). ASR is CPU/GPU-bound; a long audio clip can
 * take 30–90 s end-to-end under load, so we pick a generous ceiling.
 */
export const ASR_TIMEOUT_MS = 180_000;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function normaliseAsrError(error: unknown, timeoutSec: number): Error {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new Error(`ASR request timed out after ${timeoutSec}s`, {
      cause: error,
    });
  }
  if (error instanceof Error) return error;
  return new Error('Unable to reach ASR service. Please check your connection.', {
    cause: error,
  });
}

function notifyAsrFailure(context: string, err: Error): void {
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
  const timeoutId = setTimeout(() => controller.abort(), ASR_TIMEOUT_MS);
  return {
    controller,
    cleanup: () => {
      clearTimeout(timeoutId);
      if (userSignal) userSignal.removeEventListener('abort', onUserAbort);
    },
  };
}

/**
 * Guess a reasonable multipart filename for an audio payload. Browsers
 * typically tag `MediaRecorder` blobs as `audio/webm`, which doesn't have a
 * `.name` — the server uses the filename extension to dispatch its decoder.
 */
function resolveFilename(file: Blob | File, override?: string): string {
  if (override) return override;
  if (typeof File !== 'undefined' && file instanceof File && file.name) return file.name;
  const type = file.type || '';
  if (type.includes('mp3') || type.includes('mpeg')) return 'audio.mp3';
  if (type.includes('wav')) return 'audio.wav';
  if (type.includes('ogg')) return 'audio.ogg';
  if (type.includes('flac')) return 'audio.flac';
  if (type.includes('mp4')) return 'audio.m4a';
  return 'audio.webm';
}

/**
 * Extract `{ text, segments, language, duration }` from a Whisper-style JSON
 * body. Missing fields are left undefined so consumers can branch on shape.
 */
function parseTranscriptionBody(raw: Record<string, unknown>): AsrTranscriptionResult {
  const text = typeof raw.text === 'string' ? raw.text : '';
  const language = typeof raw.language === 'string' ? raw.language : undefined;
  const duration = typeof raw.duration === 'number' ? raw.duration : undefined;

  let segments: AsrSegment[] | undefined;
  if (Array.isArray(raw.segments)) {
    segments = raw.segments.map((seg): AsrSegment => {
      const s = seg as Record<string, unknown>;
      const words = Array.isArray(s.words)
        ? (s.words as Record<string, unknown>[]).map((w) => ({
            word: typeof w.word === 'string' ? w.word : String(w.word ?? ''),
            start: Number(w.start ?? 0),
            end: Number(w.end ?? 0),
            ...w,
          } as AsrWord))
        : undefined;
      return {
        id: typeof s.id === 'number' ? s.id : undefined,
        start: Number(s.start ?? 0),
        end: Number(s.end ?? 0),
        text: typeof s.text === 'string' ? s.text : '',
        ...(words ? { words } : {}),
        ...s,
      };
    });
  }

  return { text, segments, language, duration, raw };
}

// ---------------------------------------------------------------------------
// /v1/audio/transcriptions — OpenAI-Whisper-compatible (primary entry point)
// ---------------------------------------------------------------------------

/**
 * Transcribe an audio file via the OpenAI-Whisper-compatible endpoint. This
 * is the recommended entry point — it supports language hints, biasing
 * prompts, temperature, and timestamp granularities.
 *
 * @example
 *   const file = await fetch('/clip.webm').then(r => r.blob())
 *   const { text, segments } = await transcribeAudio(file, {
 *     response_format: 'verbose_json',
 *     timestamp_granularities: 'segment',
 *     prompt: 'Medical terminology: hypertension, tachycardia.',
 *   })
 */
export async function transcribeAudio(
  file: Blob | File,
  options: AsrTranscriptionOptions = {},
): Promise<AsrTranscriptionResult> {
  if (!file || file.size === 0) {
    throw new Error('ASR: audio file is empty.');
  }

  const { controller, cleanup } = makeAbortController(options.signal);

  try {
    const form = new FormData();
    const filename = resolveFilename(file, options.filename);
    form.append('file', file, filename);
    form.append('model', options.model ?? DEFAULT_ASR_MODEL);
    form.append('language', options.language ?? DEFAULT_ASR_LANGUAGE);
    form.append('response_format', options.response_format ?? 'json');
    form.append('temperature', String(options.temperature ?? 0.0));
    if (options.prompt) form.append('prompt', options.prompt);
    if (options.timestamp_granularities) {
      form.append('timestamp_granularities', options.timestamp_granularities);
    }

    const response = await fetch(`${ASR_API_BASE}/v1/audio/transcriptions`, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });

    if (!response.ok) {
      await throwForHttpStatus(response, 'ASR transcription failed');
    }

    // `response_format: text|srt|vtt` returns a plain string. JSON / verbose_json
    // return an object; both paths are flattened to the same result shape.
    const format = options.response_format ?? 'json';
    if (format === 'text' || format === 'srt' || format === 'vtt') {
      const bodyText = await response.text();
      return { text: bodyText, raw: { text: bodyText } };
    }
    const bodyJson = (await response.json()) as Record<string, unknown>;
    return parseTranscriptionBody(bodyJson);
  } catch (error: unknown) {
    const finalErr = normaliseAsrError(error, ASR_TIMEOUT_MS / 1000);
    notifyAsrFailure('ASR', finalErr);
    throw finalErr;
  } finally {
    cleanup();
  }
}

// ---------------------------------------------------------------------------
// Typhoon-native /transcribe and /transcribe-with-timestamps
// ---------------------------------------------------------------------------

/**
 * Transcribe via the Typhoon-native endpoints. Use this when you need the
 * server's native timestamps format (via `withTimestamps: true`) or want the
 * simplest possible request shape without Whisper conventions.
 *
 * Hits `/transcribe-with-timestamps` when `withTimestamps` is true,
 * `/transcribe` otherwise.
 */
export async function transcribeAudioTyphoon(
  file: Blob | File,
  options: TyphoonTranscribeOptions = {},
): Promise<AsrTranscriptionResult> {
  if (!file || file.size === 0) {
    throw new Error('ASR: audio file is empty.');
  }

  const { controller, cleanup } = makeAbortController(options.signal);
  const path = options.withTimestamps ? '/transcribe-with-timestamps' : '/transcribe';

  try {
    const form = new FormData();
    form.append('file', file, resolveFilename(file, options.filename));
    form.append('device', options.device ?? 'auto');

    const response = await fetch(`${ASR_API_BASE}${path}`, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });

    if (!response.ok) {
      await throwForHttpStatus(response, `ASR ${path} failed`);
    }

    const body = (await response.json()) as Record<string, unknown>;
    return parseTranscriptionBody(body);
  } catch (error: unknown) {
    const finalErr = normaliseAsrError(error, ASR_TIMEOUT_MS / 1000);
    notifyAsrFailure(`ASR ${path}`, finalErr);
    throw finalErr;
  } finally {
    cleanup();
  }
}

// ---------------------------------------------------------------------------
// Health probe
// ---------------------------------------------------------------------------

/** Probe the ASR server's `/health` endpoint. */
export async function checkAsrHealth(): Promise<AsrHealthStatus> {
  try {
    const response = await fetch(`${ASR_API_BASE}/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      await throwForHttpStatus(response, 'ASR health check failed');
    }
    return (await response.json()) as AsrHealthStatus;
  } catch (error: unknown) {
    const finalErr = normaliseAsrError(error, ASR_TIMEOUT_MS / 1000);
    notifyAsrFailure('ASR health', finalErr);
    throw finalErr;
  }
}

// ---------------------------------------------------------------------------
// MediaRecorder wrapper — capture from microphone
// ---------------------------------------------------------------------------

export interface AsrRecorder {
  /** The underlying MediaRecorder (exposed for advanced use). */
  recorder: MediaRecorder;
  /** Active MediaStream — kept so the caller can stop tracks if needed. */
  stream: MediaStream;
  /** Begin capturing audio. */
  start: () => void;
  /** Stop capturing and resolve with the final Blob. */
  stop: () => Promise<Blob>;
  /** Abort the recording without returning audio. */
  cancel: () => void;
}

export interface CreateAsrRecorderOptions {
  /**
   * MIME type requested from MediaRecorder. Browsers commonly accept
   * `audio/webm;codecs=opus` (Chromium/Firefox) or `audio/mp4` (Safari).
   * Defaults to whatever the browser picks.
   */
  mimeType?: string;
  /** MediaTrackConstraints for the audio track (defaults to `{ audio: true }`). */
  audioConstraints?: MediaTrackConstraints | boolean;
}

/**
 * Request microphone access and build a MediaRecorder-backed handle you can
 * start / stop / cancel. The returned `stop()` promise resolves with a Blob
 * ready to feed into `transcribeAudio`.
 *
 * @throws {Error} When the browser lacks MediaRecorder, or the user denies
 *                 microphone access, or no audio track is available.
 */
export async function createAsrRecorder(
  options: CreateAsrRecorderOptions = {},
): Promise<AsrRecorder> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microphone capture is not supported in this environment.');
  }
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('MediaRecorder is not available in this environment.');
  }

  const audio =
    typeof options.audioConstraints === 'boolean' || options.audioConstraints
      ? options.audioConstraints
      : true;
  const stream = await navigator.mediaDevices.getUserMedia({ audio });

  const recorderOptions = options.mimeType ? { mimeType: options.mimeType } : undefined;
  const recorder = new MediaRecorder(stream, recorderOptions);
  const chunks: Blob[] = [];
  recorder.addEventListener('dataavailable', (event: BlobEvent) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  });

  let cancelled = false;

  const stopTracks = () => {
    stream.getTracks().forEach((t) => t.stop());
  };

  const start = (): void => {
    if (recorder.state === 'inactive') {
      recorder.start();
    }
  };

  const stop = (): Promise<Blob> =>
    new Promise<Blob>((resolve, reject) => {
      if (recorder.state === 'inactive') {
        stopTracks();
        const blob = new Blob(chunks, {
          type: recorder.mimeType || options.mimeType || 'audio/webm',
        });
        resolve(blob);
        return;
      }
      recorder.addEventListener(
        'stop',
        () => {
          stopTracks();
          if (cancelled) {
            reject(new Error('Recording cancelled before completion.'));
            return;
          }
          const blob = new Blob(chunks, {
            type: recorder.mimeType || options.mimeType || 'audio/webm',
          });
          resolve(blob);
        },
        { once: true },
      );
      recorder.addEventListener(
        'error',
        (e) => {
          stopTracks();
          reject(new Error('MediaRecorder error.', { cause: e }));
        },
        { once: true },
      );
      recorder.stop();
    });

  const cancel = (): void => {
    cancelled = true;
    if (recorder.state !== 'inactive') recorder.stop();
    stopTracks();
  };

  return { recorder, stream, start, stop, cancel };
}

/**
 * Record from the microphone for `durationMs` milliseconds, then transcribe
 * the captured audio. Returns the normalised transcription.
 *
 * For interactive recording (press-to-talk), use `createAsrRecorder` directly.
 */
export async function recordAndTranscribe(
  durationMs: number,
  options: AsrTranscriptionOptions & CreateAsrRecorderOptions = {},
): Promise<AsrTranscriptionResult> {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error('recordAndTranscribe: durationMs must be a positive number.');
  }

  const recorder = await createAsrRecorder({
    mimeType: options.mimeType,
    audioConstraints: options.audioConstraints,
  });

  recorder.start();
  await new Promise<void>((r) => setTimeout(r, durationMs));
  const blob = await recorder.stop();

  return transcribeAudio(blob, options);
}
