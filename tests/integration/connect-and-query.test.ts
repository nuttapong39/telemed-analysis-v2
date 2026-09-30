// =============================================================================
// Integration: connect flow + activeSession singleton auto-heal
//
// Proves that a closure capturing an OLD ConnectionConfig (e.g. a polling
// interval set up before a reconnect) still calls /api/sql with the CURRENT
// bearer token, because executeSqlViaApi resolves through the activeSession
// singleton at call time.
// =============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { BmsSessionResponse } from '@/types';
import {
  retrieveBmsSession,
  extractConnectionConfig,
  executeSqlViaApi,
} from '@/services/bmsSession';
import {
  setActiveSession,
  clearActiveSession,
  getActiveConfig,
  getActiveMarketplaceToken,
  __resetActiveSessionForTests,
} from '@/services/activeSession';
import { apiQueue } from '@/services/apiQueue';

/** Build a minimal session-retrieval payload with a given bearer token. */
function sessionPayload(bearer: string, apiUrl: string): BmsSessionResponse {
  return {
    MessageCode: 200,
    Message: 'OK',
    RequestTime: '',
    result: {
      system_info: { version: '1.0.0', environment: 'test' },
      user_info: {
        name: 'Doctor Test',
        position: 'Doctor',
        position_id: 1,
        hospital_code: 'H00000',
        doctor_code: 'D1',
        department: 'IM',
        location: 'Main',
        is_hr_admin: false,
        is_director: false,
        bms_url: apiUrl,
        bms_session_code: bearer,
        bms_database_name: 'hos',
        bms_database_type: 'mysql',
      },
      expired_second: 36000,
    },
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  __resetActiveSessionForTests();
  apiQueue.clear();
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('connect + singleton auto-heal', () => {
  it('publishes config+token to the singleton after handshake', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve(sessionPayload('bearer-FIRST', 'https://api-a.example')),
    });

    const resp = await retrieveBmsSession('sess-1');
    const cfg = extractConnectionConfig(resp);
    setActiveSession('sess-1', cfg, 'mkt-FIRST');

    expect(getActiveConfig()?.bearerToken).toBe('bearer-FIRST');
    expect(getActiveConfig()?.apiUrl).toBe('https://api-a.example');
    expect(getActiveMarketplaceToken()).toBe('mkt-FIRST');
  });

  it('a closure with OLD config still sends the NEW bearer after reconnect', async () => {
    // --- First connect ---
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve(sessionPayload('bearer-OLD', 'https://api-a.example')),
    });
    const firstResp = await retrieveBmsSession('sess-1');
    const oldCfg = extractConnectionConfig(firstResp);
    setActiveSession('sess-1', oldCfg, 'mkt-OLD');

    // --- Capture a closure that holds the OLD config (simulating a polling
    //     interval that was set up before the reconnect happened). ---
    const staleQuery = () => executeSqlViaApi('SELECT 1', oldCfg);

    // --- Second connect with a NEW bearer ---
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve(sessionPayload('bearer-NEW', 'https://api-b.example')),
    });
    const secondResp = await retrieveBmsSession('sess-2');
    const newCfg = extractConnectionConfig(secondResp);
    setActiveSession('sess-2', newCfg, 'mkt-NEW');

    // --- Fire the stale closure. The fetch call must hit api-b with
    //     bearer-NEW because resolveConfig inside executeSqlViaApi prefers
    //     the singleton over the captured value. ---
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          result: {},
          MessageCode: 200,
          Message: 'OK',
          RequestTime: '',
          data: [],
          field: [],
          field_name: [],
          record_count: 0,
        }),
    });

    await staleQuery();

    const staleCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    const [calledUrl, calledOpts] = staleCall;
    expect(String(calledUrl)).toMatch(/^https:\/\/api-b\.example\/api\/sql(\?|$)/);
    expect(calledOpts.headers.Authorization).toBe('Bearer bearer-NEW');

    // And the body should include the NEW marketplace token too.
    const body = JSON.parse(calledOpts.body as string);
    expect(body['marketplace-token']).toBe('mkt-NEW');
  });

  it('after clearActiveSession, a stale closure falls back to its captured config', async () => {
    const capturedCfg = {
      apiUrl: 'https://api-captured.example',
      bearerToken: 'bearer-CAPTURED',
      databaseType: 'mysql' as const,
      appIdentifier: 'TestApp',
    };
    setActiveSession('sess-1', capturedCfg, 'mkt-A');
    clearActiveSession();

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          result: {},
          MessageCode: 200,
          Message: 'OK',
          RequestTime: '',
          data: [],
          field: [],
          field_name: [],
          record_count: 0,
        }),
    });

    await executeSqlViaApi('SELECT 1', capturedCfg);

    const [, opts] = fetchMock.mock.calls[0];
    // Falls back to the caller-supplied config — bearer unchanged.
    expect(opts.headers.Authorization).toBe('Bearer bearer-CAPTURED');
    // No marketplace token (the cleared singleton provided none).
    const body = JSON.parse(opts.body as string);
    expect(body['marketplace-token']).toBeUndefined();
  });

  it('marketplace-token change via setActiveMarketplaceToken is seen by subsequent calls', async () => {
    const cfg = {
      apiUrl: 'https://api.example',
      bearerToken: 'bearer-A',
      databaseType: 'mysql' as const,
      appIdentifier: 'TestApp',
    };
    setActiveSession('sess-1', cfg, 'mkt-ORIG');

    const { setActiveMarketplaceToken } = await import('@/services/activeSession');
    setActiveMarketplaceToken('mkt-UPDATED');

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          result: {},
          MessageCode: 200,
          Message: 'OK',
          RequestTime: '',
          data: [],
          field: [],
          field_name: [],
          record_count: 0,
        }),
    });

    await executeSqlViaApi('SELECT 1', cfg);

    const [, opts] = fetchMock.mock.calls[0];
    const body = JSON.parse(opts.body as string);
    expect(body['marketplace-token']).toBe('mkt-UPDATED');
  });
});
