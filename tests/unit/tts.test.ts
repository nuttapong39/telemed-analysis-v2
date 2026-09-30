// =============================================================================
// TTS support module — unit tests
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  synthesizeSpeech,
  playSpeech,
  listTtsVoices,
  listTtsModels,
  normalizeThaiText,
  checkTtsHealth,
  TTS_API_BASE,
  DEFAULT_TTS_MODEL,
  DEFAULT_TTS_VOICE,
  MAX_TTS_TEXT_LENGTH,
} from '@/services/tts';
import {
  __resetNotificationsForTests,
  subscribeToNotifications,
  type Notification,
} from '@/services/notify';

let fetchMock: ReturnType<typeof vi.fn>;
// Save globals that individual tests mutate so we can restore them after each
// case — otherwise replacements leak into unrelated tests (e.g. the Audio
// constructor we swap in for playSpeech).
const originalAudio = globalThis.Audio;
const originalCreateObjectURL = globalThis.URL.createObjectURL;
const originalRevokeObjectURL = globalThis.URL.revokeObjectURL;

beforeEach(() => {
  __resetNotificationsForTests();
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.Audio = originalAudio;
  Object.defineProperty(globalThis.URL, 'createObjectURL', {
    configurable: true,
    value: originalCreateObjectURL,
  });
  Object.defineProperty(globalThis.URL, 'revokeObjectURL', {
    configurable: true,
    value: originalRevokeObjectURL,
  });
});

// ---------------------------------------------------------------------------
// synthesizeSpeech
// ---------------------------------------------------------------------------

describe('synthesizeSpeech', () => {
  it('POSTs to /v1/audio/speech with defaults (model=voxcpm-thai, voice=default, wav)', async () => {
    const wav = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/wav' });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      blob: () => Promise.resolve(wav),
      headers: { get: (h: string) => (h === 'Content-Type' ? 'audio/wav' : null) },
    });

    const res = await synthesizeSpeech('สวัสดีครับ');

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(`${TTS_API_BASE}/v1/audio/speech`);
    expect(opts.method).toBe('POST');
    // TTS is public — no Authorization header.
    expect(opts.headers).toEqual({ 'Content-Type': 'application/json' });

    const body = JSON.parse(opts.body as string);
    expect(body.input).toBe('สวัสดีครับ');
    expect(body.model).toBe(DEFAULT_TTS_MODEL);
    expect(body.voice).toBe(DEFAULT_TTS_VOICE);
    expect(body.response_format).toBe('wav');

    expect(res.blob).toBe(wav);
    expect(res.contentType).toBe('audio/wav');
    expect(res.format).toBe('wav');
  });

  it('passes through model, voice, and response_format options', async () => {
    const mp3 = new Blob([new Uint8Array([1])], { type: 'audio/mpeg' });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      blob: () => Promise.resolve(mp3),
      headers: { get: () => 'audio/mpeg' },
    });

    await synthesizeSpeech('hi', {
      model: 'voxcpm-thai',
      voice: 'female',
      response_format: 'mp3',
    });

    const [, opts] = fetchMock.mock.calls[0];
    const body = JSON.parse(opts.body as string);
    expect(body.voice).toBe('female');
    expect(body.response_format).toBe('mp3');
  });

  it('trims whitespace and rejects empty / whitespace-only input BEFORE fetch', async () => {
    await expect(synthesizeSpeech('')).rejects.toThrow(/empty/i);
    await expect(synthesizeSpeech('   ')).rejects.toThrow(/empty/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects input longer than MAX_TTS_TEXT_LENGTH without calling fetch', async () => {
    const tooLong = 'a'.repeat(MAX_TTS_TEXT_LENGTH + 1);

    await expect(synthesizeSpeech(tooLong)).rejects.toThrow(/exceeds.*characters/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to audio/mpeg content-type when server omits Content-Type for mp3 format', async () => {
    const mp3 = new Blob([new Uint8Array([1])], { type: '' });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      blob: () => Promise.resolve(mp3),
      headers: { get: () => null },
    });

    const res = await synthesizeSpeech('hi', { response_format: 'mp3' });
    expect(res.contentType).toBe('audio/mpeg');
  });

  it('throws on non-ok response and emits an error toast', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ detail: 'model not loaded' }),
      text: () => Promise.resolve(''),
    });

    const received: Notification[][] = [];
    subscribeToNotifications((n) => received.push(n));

    await expect(synthesizeSpeech('hi')).rejects.toThrow(
      /TTS synthesis failed.*HTTP 500.*model not loaded/,
    );
    const last = received[received.length - 1];
    expect(last[0].level).toBe('error');
    expect(last[0].message).toContain('TTS');
  });

  it('throws a rate-limit-branded error on HTTP 429 (warning toast, not error)', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
    });

    const received: Notification[][] = [];
    subscribeToNotifications((n) => received.push(n));

    await expect(synthesizeSpeech('hi')).rejects.toThrow(/HTTP 429/);
    const last = received[received.length - 1];
    expect(last[0].level).toBe('warning');
  });

  it('throws a timeout-branded error on AbortError', async () => {
    const abortErr = new DOMException('aborted', 'AbortError');
    fetchMock.mockRejectedValue(abortErr);

    await expect(synthesizeSpeech('hi')).rejects.toThrow(/TTS request timed out/);
  });
});

// ---------------------------------------------------------------------------
// listTtsVoices / listTtsModels
// ---------------------------------------------------------------------------

describe('listTtsVoices', () => {
  it('GETs /v1/voices and returns the voices array', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          voices: [
            { id: 'default', name: 'Default (no cloning)' },
            { id: 'female', name: 'Female' },
            { id: 'male', name: 'Male' },
          ],
        }),
    });

    const voices = await listTtsVoices();

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(`${TTS_API_BASE}/v1/voices`);
    expect(opts.method).toBe('GET');
    expect(opts.headers.Authorization).toBeUndefined();

    expect(voices).toHaveLength(3);
    expect(voices.map((v) => v.id)).toEqual(['default', 'female', 'male']);
  });

  it('returns empty array when voices field missing', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });
    expect(await listTtsVoices()).toEqual([]);
  });
});

describe('listTtsModels', () => {
  it('GETs /v1/models and returns the data array', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          object: 'list',
          data: [{ id: 'voxcpm-thai', object: 'model', owned_by: 'local' }],
        }),
    });

    const models = await listTtsModels();
    expect(models).toHaveLength(1);
    expect(models[0].id).toBe('voxcpm-thai');
  });
});

// ---------------------------------------------------------------------------
// normalizeThaiText / checkTtsHealth
// ---------------------------------------------------------------------------

describe('normalizeThaiText', () => {
  it('POSTs to /v1/text/normalize and returns { original, normalized }', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          original: '๕๐๐ บาท ฯลฯ',
          normalized: 'ห้าร้อยบาทและอื่นๆ',
        }),
    });

    const res = await normalizeThaiText('๕๐๐ บาท ฯลฯ');

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(`${TTS_API_BASE}/v1/text/normalize`);
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body as string);
    expect(body.text).toBe('๕๐๐ บาท ฯลฯ');
    expect(res.normalized).toContain('ห้าร้อย');
  });

  it('refuses empty input before calling fetch', async () => {
    await expect(normalizeThaiText('')).rejects.toThrow(/empty/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('checkTtsHealth', () => {
  it('GETs /health and returns the status payload', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ status: 'ok', model: 'loaded', sample_rate: 44100 }),
    });

    const res = await checkTtsHealth();
    expect(res.status).toBe('ok');
    expect(res.sample_rate).toBe(44100);
  });
});

// ---------------------------------------------------------------------------
// playSpeech
// ---------------------------------------------------------------------------

describe('playSpeech', () => {
  /** Register a fresh mocked Audio class and return the listener hash for the
   *  most recently created instance. Using a class (not vi.fn) so `new Audio(url)`
   *  has proper [[Construct]] semantics under jsdom. */
  function installMockAudio() {
    const listeners: Record<string, () => void> = {};
    const play = vi.fn().mockResolvedValue(undefined);
    const pause = vi.fn();
    class MockAudio {
      play = play;
      pause = pause;
      currentTime = 0;
      addEventListener = vi.fn((evt: string, cb: () => void) => {
        listeners[evt] = cb;
      });
      removeEventListener = vi.fn();
    }
    globalThis.Audio = MockAudio as unknown as typeof Audio;
    return { listeners, play, pause };
  }

  function installUrlMocks(url: string) {
    const createObjectURL = vi.fn(() => url);
    const revokeObjectURL = vi.fn();
    Object.defineProperty(globalThis.URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(globalThis.URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    });
    return { createObjectURL, revokeObjectURL };
  }

  it('synthesizes then constructs an Audio element and calls play()', async () => {
    const wav = new Blob([new Uint8Array([1])], { type: 'audio/wav' });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      blob: () => Promise.resolve(wav),
      headers: { get: () => 'audio/wav' },
    });

    const { createObjectURL, revokeObjectURL } = installUrlMocks('blob:fake-url-1');
    const { listeners, play } = installMockAudio();

    const playback = await playSpeech('hello');

    expect(createObjectURL).toHaveBeenCalledWith(wav);
    expect(play).toHaveBeenCalledTimes(1);
    expect(playback.url).toBe('blob:fake-url-1');

    // Simulate playback ending — the Blob URL should be revoked.
    listeners.ended?.();
    await expect(playback.ended).resolves.toBeUndefined();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url-1');
  });

  it('stop() pauses audio and revokes the Blob URL', async () => {
    const wav = new Blob([new Uint8Array([1])], { type: 'audio/wav' });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      blob: () => Promise.resolve(wav),
      headers: { get: () => 'audio/wav' },
    });

    const { revokeObjectURL } = installUrlMocks('blob:fake-url-2');
    const { pause } = installMockAudio();

    const playback = await playSpeech('hi');
    playback.stop();

    expect(pause).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url-2');

    // Second stop() is a no-op — revoke should NOT be called again.
    revokeObjectURL.mockClear();
    playback.stop();
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });
});
