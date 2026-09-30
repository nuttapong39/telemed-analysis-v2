// =============================================================================
// LLM support module — unit tests
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  callLlm,
  streamLlm,
  listLlmModels,
  LLM_API_BASE,
  DEFAULT_LLM_MODEL,
} from '@/services/llm';
import {
  setActiveSession,
  __resetActiveSessionForTests,
} from '@/services/activeSession';
import { __resetNotificationsForTests, subscribeToNotifications, type Notification } from '@/services/notify';
import type { ConnectionConfig } from '@/types';

function makeConfig(): ConnectionConfig {
  return {
    apiUrl: 'https://bms.example',
    bearerToken: 'bearer-JWT',
    databaseType: 'mysql',
    appIdentifier: 'Test',
  };
}

function installSession(sessionId = 'SESS-GUID-123') {
  setActiveSession(sessionId, makeConfig(), undefined);
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  __resetActiveSessionForTests();
  __resetNotificationsForTests();
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// callLlm — non-streaming
// ---------------------------------------------------------------------------

describe('callLlm (non-streaming)', () => {
  it('POSTs to /v1/chat/completions with Bearer = session id (NOT bms_session_code)', async () => {
    installSession('SESS-GUID-42');
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          id: 'c1',
          object: 'chat.completion',
          model: 'deepseek',
          choices: [
            {
              index: 0,
              finish_reason: 'stop',
              message: { role: 'assistant', content: 'hello world' },
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
        }),
    });

    const res = await callLlm([{ role: 'user', content: 'hi' }]);

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(`${LLM_API_BASE}/v1/chat/completions`);
    expect(opts.method).toBe('POST');
    // CRITICAL: the Bearer must be the session id, not the BMS JWT.
    expect(opts.headers.Authorization).toBe('Bearer SESS-GUID-42');
    expect(opts.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(opts.body as string);
    expect(body.model).toBe(DEFAULT_LLM_MODEL);
    expect(body.stream).toBe(false);
    expect(body.max_tokens).toBe(8192);
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);

    expect(res.id).toBe('c1');
    expect(res.content).toBe('hello world');
    expect(res.finishReason).toBe('stop');
    expect(res.usage?.total_tokens).toBe(12);
  });

  it('passes through optional model, temperature, top_p, max_tokens', async () => {
    installSession();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          id: 'c2',
          model: 'gemma4',
          choices: [{ message: { content: '' }, finish_reason: 'stop' }],
        }),
    });

    await callLlm([{ role: 'user', content: 'hi' }], {
      model: 'gemma4',
      temperature: 0.3,
      top_p: 0.9,
      max_tokens: 256,
    });

    const [, opts] = fetchMock.mock.calls[0];
    const body = JSON.parse(opts.body as string);
    expect(body.model).toBe('gemma4');
    expect(body.temperature).toBe(0.3);
    expect(body.top_p).toBe(0.9);
    expect(body.max_tokens).toBe(256);
  });

  it('omits temperature/top_p keys entirely when not provided', async () => {
    installSession();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: '' }, finish_reason: 'stop' }],
        }),
    });

    await callLlm([{ role: 'user', content: 'hi' }]);

    const [, opts] = fetchMock.mock.calls[0];
    const body = JSON.parse(opts.body as string);
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('top_p');
  });

  it('throws a specific "Session unauthorized" error on HTTP 401', async () => {
    installSession();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: { message: 'missing_auth' } }),
      text: () => Promise.resolve(''),
    });

    await expect(
      callLlm([{ role: 'user', content: 'hi' }]),
    ).rejects.toThrow('Session unauthorized. Please reconnect with a valid session ID.');
  });

  it('throws a "LLM API bad request" error on HTTP 400', async () => {
    installSession();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: () =>
        Promise.resolve({ error: { message: 'unknown model xyz' } }),
      text: () => Promise.resolve(''),
    });

    await expect(
      callLlm([{ role: 'user', content: 'hi' }]),
    ).rejects.toThrow(/LLM API bad request: unknown model xyz/);
  });

  it('throws a rate-limit message on HTTP 429', async () => {
    installSession();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
    });

    await expect(
      callLlm([{ role: 'user', content: 'hi' }]),
    ).rejects.toThrow(/HTTP 429/);
  });

  it('throws an "upstream error" message on HTTP 502', async () => {
    installSession();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: () =>
        Promise.resolve({ error: { message: 'provider timeout' } }),
      text: () => Promise.resolve(''),
    });

    await expect(
      callLlm([{ role: 'user', content: 'hi' }]),
    ).rejects.toThrow(/LLM API upstream error.*HTTP 502.*provider timeout/);
  });

  it('refuses to call without an active session (no toast, explicit error)', async () => {
    // No installSession() — singleton is empty.
    await expect(
      callLlm([{ role: 'user', content: 'hi' }]),
    ).rejects.toThrow(/requires an active BMS session/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('suppresses toasts for Session unauthorized errors (handled by SessionExpired UI)', async () => {
    installSession();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
    });

    const received: Notification[][] = [];
    subscribeToNotifications((n) => received.push(n));

    await expect(callLlm([{ role: 'user', content: 'hi' }])).rejects.toThrow();

    // Only the initial empty snapshot — no toast for unauthorized.
    expect(received.length).toBe(1);
    expect(received[0]).toEqual([]);
  });

  it('emits an error toast on 502 upstream failure', async () => {
    installSession();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: () => Promise.resolve({ error: { message: 'upstream down' } }),
      text: () => Promise.resolve(''),
    });

    const received: Notification[][] = [];
    subscribeToNotifications((n) => received.push(n));

    await expect(callLlm([{ role: 'user', content: 'hi' }])).rejects.toThrow();

    const last = received[received.length - 1];
    expect(last.length).toBe(1);
    expect(last[0].level).toBe('error');
    expect(last[0].message).toContain('LLM');
  });

  it('aborts when the caller-supplied AbortSignal fires', async () => {
    installSession();
    const abortErr = new DOMException('aborted', 'AbortError');
    fetchMock.mockRejectedValue(abortErr);

    const ac = new AbortController();
    ac.abort();

    await expect(
      callLlm([{ role: 'user', content: 'hi' }], { signal: ac.signal }),
    ).rejects.toThrow(/LLM call timed out|aborted/);
  });
});

// ---------------------------------------------------------------------------
// streamLlm — SSE parsing
// ---------------------------------------------------------------------------

/** Build a ReadableStream that yields the given SSE frames. */
function sseStream(frames: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i >= frames.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(frames[i++]));
    },
  });
}

describe('streamLlm (SSE)', () => {
  it('invokes onDelta for each chunk and returns the accumulated content on [DONE]', async () => {
    installSession();
    const frames = [
      `data: ${JSON.stringify({ id: 'c1', model: 'deepseek', choices: [{ delta: { content: 'Hello' } }] })}\n\n`,
      `data: ${JSON.stringify({ id: 'c1', model: 'deepseek', choices: [{ delta: { content: ', ' }, finish_reason: null }] })}\n\n`,
      `data: ${JSON.stringify({ id: 'c1', model: 'deepseek', choices: [{ delta: { content: 'world!' }, finish_reason: 'stop' }] })}\n\n`,
      'data: [DONE]\n\n',
    ];

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      body: sseStream(frames),
    });

    const deltas: string[] = [];
    const res = await streamLlm([{ role: 'user', content: 'hi' }], {
      onDelta: (d) => deltas.push(d),
    });

    expect(deltas).toEqual(['Hello', ', ', 'world!']);
    expect(res.content).toBe('Hello, world!');
    expect(res.id).toBe('c1');
    expect(res.finishReason).toBe('stop');
  });

  it('sets stream:true and Accept: text/event-stream in the request', async () => {
    installSession();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      body: sseStream(['data: [DONE]\n\n']),
    });

    await streamLlm([{ role: 'user', content: 'hi' }], { onDelta: () => {} });

    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.headers.Accept).toBe('text/event-stream');
    const body = JSON.parse(opts.body as string);
    expect(body.stream).toBe(true);
  });

  it('handles frames that arrive split across chunk boundaries', async () => {
    installSession();
    const fullFrame = `data: ${JSON.stringify({ choices: [{ delta: { content: 'abcdef' }, finish_reason: 'stop' }] })}\n\n`;
    // Split the frame mid-JSON.
    const first = fullFrame.slice(0, 20);
    const second = fullFrame.slice(20);

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      body: sseStream([first, second, 'data: [DONE]\n\n']),
    });

    const deltas: string[] = [];
    const res = await streamLlm([{ role: 'user', content: 'hi' }], {
      onDelta: (d) => deltas.push(d),
    });

    expect(res.content).toBe('abcdef');
    expect(deltas).toEqual(['abcdef']);
  });

  it('ignores malformed frames instead of throwing', async () => {
    installSession();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      body: sseStream([
        'data: {not valid json\n\n',
        `data: ${JSON.stringify({ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] })}\n\n`,
        'data: [DONE]\n\n',
      ]),
    });

    const res = await streamLlm([{ role: 'user', content: 'hi' }], {
      onDelta: () => {},
    });
    expect(res.content).toBe('ok');
  });

  it('throws "Session unauthorized" on HTTP 401 before reading the body', async () => {
    installSession();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
    });

    await expect(
      streamLlm([{ role: 'user', content: 'hi' }], { onDelta: () => {} }),
    ).rejects.toThrow('Session unauthorized. Please reconnect with a valid session ID.');
  });
});

// ---------------------------------------------------------------------------
// listLlmModels — public endpoint
// ---------------------------------------------------------------------------

describe('listLlmModels', () => {
  it('GETs /v1/models WITHOUT an Authorization header', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          object: 'list',
          data: [
            { id: 'deepseek', object: 'model', owned_by: 'deepseek' },
            { id: 'kimi', object: 'model', owned_by: 'moonshot' },
          ],
        }),
    });

    const models = await listLlmModels();

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(`${LLM_API_BASE}/v1/models`);
    expect(opts.method).toBe('GET');
    // Model discovery is unauthenticated per spec.
    expect(opts.headers.Authorization).toBeUndefined();

    expect(models).toHaveLength(2);
    expect(models[0].id).toBe('deepseek');
  });

  it('returns an empty array when the server omits the data field', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ object: 'list' }),
    });

    const models = await listLlmModels();
    expect(models).toEqual([]);
  });

  it('throws + toasts on non-ok response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ message: 'boom' }),
      text: () => Promise.resolve(''),
    });

    const received: Notification[][] = [];
    subscribeToNotifications((n) => received.push(n));

    await expect(listLlmModels()).rejects.toThrow(/LLM model listing failed/);

    const last = received[received.length - 1];
    expect(last[0].level).toBe('error');
  });
});
