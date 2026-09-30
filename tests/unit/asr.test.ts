// =============================================================================
// ASR support module — unit tests
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  transcribeAudio,
  transcribeAudioTyphoon,
  checkAsrHealth,
  createAsrRecorder,
  ASR_API_BASE,
  DEFAULT_ASR_MODEL,
  DEFAULT_ASR_LANGUAGE,
} from '@/services/asr';
import {
  __resetNotificationsForTests,
  subscribeToNotifications,
  type Notification,
} from '@/services/notify';

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  __resetNotificationsForTests();
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// transcribeAudio (/v1/audio/transcriptions — Whisper-compatible)
// ---------------------------------------------------------------------------

function makeAudioBlob(bytes = [1, 2, 3, 4], mime = 'audio/webm'): Blob {
  return new Blob([new Uint8Array(bytes)], { type: mime });
}

async function extractFormData(body: BodyInit | null | undefined): Promise<FormData> {
  expect(body).toBeInstanceOf(FormData);
  return body as FormData;
}

describe('transcribeAudio', () => {
  it('POSTs multipart/form-data to /v1/audio/transcriptions with defaults', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ text: 'สวัสดีครับ' }),
      text: () => Promise.resolve(''),
    });

    const audio = makeAudioBlob();
    const res = await transcribeAudio(audio);

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(`${ASR_API_BASE}/v1/audio/transcriptions`);
    expect(opts.method).toBe('POST');
    // ASR is public — no Authorization header.
    expect(opts.headers).toBeUndefined(); // fetch+FormData sets its own boundary
    const form = await extractFormData(opts.body);
    expect(form.get('model')).toBe(DEFAULT_ASR_MODEL);
    expect(form.get('language')).toBe(DEFAULT_ASR_LANGUAGE);
    expect(form.get('response_format')).toBe('json');
    expect(form.get('temperature')).toBe('0');
    expect(form.get('prompt')).toBeNull();
    expect(form.get('timestamp_granularities')).toBeNull();

    const filePart = form.get('file');
    expect(filePart).toBeInstanceOf(Blob);

    expect(res.text).toBe('สวัสดีครับ');
    expect(res.raw).toEqual({ text: 'สวัสดีครับ' });
  });

  it('passes through custom model, language, prompt, temperature, response_format', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ text: 'hello', language: 'en', duration: 2.5 }),
    });

    await transcribeAudio(makeAudioBlob(), {
      model: 'custom',
      language: 'en',
      prompt: 'medical vocabulary',
      temperature: 0.2,
      response_format: 'verbose_json',
      timestamp_granularities: 'segment,word',
    });

    const [, opts] = fetchMock.mock.calls[0];
    const form = await extractFormData(opts.body);
    expect(form.get('model')).toBe('custom');
    expect(form.get('language')).toBe('en');
    expect(form.get('prompt')).toBe('medical vocabulary');
    expect(form.get('temperature')).toBe('0.2');
    expect(form.get('response_format')).toBe('verbose_json');
    expect(form.get('timestamp_granularities')).toBe('segment,word');
  });

  it('normalises verbose_json segments into AsrSegment shape', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          text: 'Hello world.',
          language: 'en',
          duration: 3,
          segments: [
            {
              id: 0,
              start: 0.0,
              end: 1.0,
              text: 'Hello',
              words: [{ word: 'Hello', start: 0.0, end: 0.9 }],
            },
            { id: 1, start: 1.0, end: 2.0, text: 'world.' },
          ],
        }),
    });

    const res = await transcribeAudio(makeAudioBlob(), {
      response_format: 'verbose_json',
    });

    expect(res.language).toBe('en');
    expect(res.duration).toBe(3);
    expect(res.segments).toHaveLength(2);
    expect(res.segments?.[0].text).toBe('Hello');
    expect(res.segments?.[0].words).toHaveLength(1);
    expect(res.segments?.[0].words?.[0].word).toBe('Hello');
    expect(res.segments?.[1].text).toBe('world.');
  });

  it('returns the raw string body when response_format is `text`', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('Hello world'),
      json: () => Promise.reject(new Error('not json')),
    });

    const res = await transcribeAudio(makeAudioBlob(), {
      response_format: 'text',
    });

    expect(res.text).toBe('Hello world');
    expect(res.raw).toEqual({ text: 'Hello world' });
  });

  it('refuses to POST an empty Blob', async () => {
    const empty = new Blob([], { type: 'audio/wav' });
    await expect(transcribeAudio(empty)).rejects.toThrow(/empty/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the File.name as the multipart filename when available', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ text: '' }),
    });

    const file = new File([new Uint8Array([1, 2, 3])], 'patient_visit.mp3', {
      type: 'audio/mpeg',
    });
    await transcribeAudio(file);

    const [, opts] = fetchMock.mock.calls[0];
    const form = await extractFormData(opts.body);
    const filePart = form.get('file') as File;
    expect(filePart.name).toBe('patient_visit.mp3');
  });

  it('infers a filename from blob.type when no File.name is available', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ text: '' }),
    });

    await transcribeAudio(makeAudioBlob([1], 'audio/mp3'));

    const [, opts] = fetchMock.mock.calls[0];
    const form = await extractFormData(opts.body);
    const filePart = form.get('file') as File;
    expect(filePart.name).toBe('audio.mp3');
  });

  it('throws + toasts on non-ok response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      json: () => Promise.resolve({ detail: 'Unsupported audio format' }),
      text: () => Promise.resolve(''),
    });

    const received: Notification[][] = [];
    subscribeToNotifications((n) => received.push(n));

    await expect(transcribeAudio(makeAudioBlob())).rejects.toThrow(
      /ASR transcription failed.*HTTP 422.*Unsupported audio format/,
    );
    const last = received[received.length - 1];
    expect(last[0].level).toBe('error');
    expect(last[0].message).toContain('ASR');
  });

  it('emits a warning toast (not error) on HTTP 429', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
    });

    const received: Notification[][] = [];
    subscribeToNotifications((n) => received.push(n));

    await expect(transcribeAudio(makeAudioBlob())).rejects.toThrow(/HTTP 429/);
    const last = received[received.length - 1];
    expect(last[0].level).toBe('warning');
  });

  it('surfaces AbortError as a timeout-branded error', async () => {
    const abortErr = new DOMException('aborted', 'AbortError');
    fetchMock.mockRejectedValue(abortErr);

    await expect(transcribeAudio(makeAudioBlob())).rejects.toThrow(
      /ASR request timed out/,
    );
  });
});

// ---------------------------------------------------------------------------
// transcribeAudioTyphoon (/transcribe and /transcribe-with-timestamps)
// ---------------------------------------------------------------------------

describe('transcribeAudioTyphoon', () => {
  it('POSTs to /transcribe with device=auto by default', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ text: 'สวัสดี' }),
    });

    await transcribeAudioTyphoon(makeAudioBlob());

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(`${ASR_API_BASE}/transcribe`);
    const form = await extractFormData(opts.body);
    expect(form.get('device')).toBe('auto');
  });

  it('POSTs to /transcribe-with-timestamps when withTimestamps is true', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          text: 'hello world',
          segments: [{ id: 0, start: 0, end: 1, text: 'hello world' }],
        }),
    });

    const res = await transcribeAudioTyphoon(makeAudioBlob(), {
      withTimestamps: true,
      device: 'cuda',
    });

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(`${ASR_API_BASE}/transcribe-with-timestamps`);
    const form = await extractFormData(opts.body);
    expect(form.get('device')).toBe('cuda');

    expect(res.text).toBe('hello world');
    expect(res.segments).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// checkAsrHealth
// ---------------------------------------------------------------------------

describe('checkAsrHealth', () => {
  it('GETs /health and returns the parsed body', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ status: 'ok' }),
    });

    const res = await checkAsrHealth();
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(`${ASR_API_BASE}/health`);
    expect(opts.method).toBe('GET');
    expect(res.status).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// createAsrRecorder
// ---------------------------------------------------------------------------

describe('createAsrRecorder', () => {
  const originalMediaDevices = navigator.mediaDevices;
  const originalMediaRecorder = (globalThis as { MediaRecorder?: unknown }).MediaRecorder;

  afterEach(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: originalMediaDevices,
    });
    (globalThis as { MediaRecorder?: unknown }).MediaRecorder = originalMediaRecorder;
  });

  it('throws when navigator.mediaDevices.getUserMedia is unavailable', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: undefined,
    });

    await expect(createAsrRecorder()).rejects.toThrow(
      /Microphone capture is not supported/,
    );
  });

  it('throws when MediaRecorder is unavailable', async () => {
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });
    (globalThis as { MediaRecorder?: unknown }).MediaRecorder = undefined;

    await expect(createAsrRecorder()).rejects.toThrow(
      /MediaRecorder is not available/,
    );
  });

  it('captures data, returns a Blob on stop(), and stops the MediaStream tracks', async () => {
    const track1 = { stop: vi.fn() };
    const track2 = { stop: vi.fn() };
    const stream = {
      getTracks: () => [track1, track2],
    } as unknown as MediaStream;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });

    const listeners: Record<string, ((e?: unknown) => void)[]> = {};
    class MockMediaRecorder {
      mimeType = 'audio/webm';
      state: 'inactive' | 'recording' = 'inactive';
      constructor(_stream: MediaStream, _opts?: unknown) {}
      start(): void {
        this.state = 'recording';
        // Emit one data chunk after start.
        setTimeout(() => {
          const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' });
          listeners.dataavailable?.forEach((l) =>
            l({ data: blob } as unknown as BlobEvent),
          );
        }, 0);
      }
      stop(): void {
        this.state = 'inactive';
        setTimeout(() => listeners.stop?.forEach((l) => l()), 0);
      }
      addEventListener(evt: string, cb: (e?: unknown) => void): void {
        listeners[evt] ??= [];
        listeners[evt].push(cb);
      }
    }
    (globalThis as { MediaRecorder?: unknown }).MediaRecorder = MockMediaRecorder;

    const recorder = await createAsrRecorder();
    recorder.start();
    await new Promise((r) => setTimeout(r, 5)); // let data chunk flow
    const blob = await recorder.stop();

    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe('audio/webm');
    expect(track1.stop).toHaveBeenCalled();
    expect(track2.stop).toHaveBeenCalled();
  });
});
