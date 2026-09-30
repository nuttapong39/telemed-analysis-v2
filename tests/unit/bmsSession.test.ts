// =============================================================================
// T014 - BMS Session Service Tests
// Tests session retrieval, config extraction, SQL execution, and DB detection
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { BmsSessionResponse, ConnectionConfig, SqlApiResponse } from '@/types';
import {
  retrieveBmsSession,
  extractConnectionConfig,
  extractUserInfo,
  extractSystemInfo,
  executeSqlViaApi,
  detectDatabaseType,
  PASTE_JSON_URL,
  APP_IDENTIFIER,
} from '@/services/bmsSession';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Complete sample BMS session response */
function createSampleResponse(
  overrides?: Partial<BmsSessionResponse>,
): BmsSessionResponse {
  return {
    MessageCode: 0,
    Message: 'success',
    RequestTime: '2026-01-01T00:00:00Z',
    result: {
      system_info: {
        version: '2.0.0',
        environment: 'production',
      },
      user_info: {
        name: 'Dr. Smith',
        position: 'Physician',
        position_id: 10,
        hospital_code: 'H001',
        doctor_code: 'D001',
        department: 'Internal Medicine',
        location: 'Building A',
        is_hr_admin: false,
        is_director: true,
        bms_url: 'https://bms.hospital.com',
        bms_session_port: 443,
        bms_session_code: 'bearer-token-abc',
        bms_database_name: 'hospital_db',
        bms_database_type: 'mysql',
      },
      key_value: 'fallback-key-value',
      expired_second: 3600,
    },
    ...overrides,
  };
}

/** Standard connection config for SQL execution tests */
function createConnectionConfig(
  overrides?: Partial<ConnectionConfig>,
): ConnectionConfig {
  return {
    apiUrl: 'https://bms.hospital.com',
    bearerToken: 'bearer-token-abc',
    databaseType: 'mysql',
    appIdentifier: APP_IDENTIFIER,
    ...overrides,
  };
}

/** Standard SQL API response */
function createSqlApiResponse(
  overrides?: Partial<SqlApiResponse>,
): SqlApiResponse {
  return {
    result: {},
    MessageCode: 0,
    Message: 'OK',
    RequestTime: '2026-01-01T00:00:00Z',
    data: [{ version: 'MySQL 8.0.32' }],
    field: [253],
    field_name: ['version'],
    record_count: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// retrieveBmsSession
// ---------------------------------------------------------------------------

describe('retrieveBmsSession', () => {
  it('calls the correct URL with the session ID', async () => {
    const sampleResponse = createSampleResponse();
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(sampleResponse),
    });

    await retrieveBmsSession('test-session-id');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledOptions] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe(`${PASTE_JSON_URL}?Action=GET&code=test-session-id`);
    expect(calledOptions).toHaveProperty('signal');
  });

  it('parses and returns the JSON response', async () => {
    const sampleResponse = createSampleResponse();
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(sampleResponse),
    });

    const result = await retrieveBmsSession('test-session-id');

    expect(result).toEqual(sampleResponse);
    expect(result.MessageCode).toBe(0);
    expect(result.result?.user_info?.name).toBe('Dr. Smith');
  });

  it('throws on non-OK HTTP response with user-friendly message', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
    });

    await expect(retrieveBmsSession('bad-session')).rejects.toThrow(
      /Failed to retrieve session \(HTTP 404\)/,
    );
  });

  it('throws user-friendly message on network error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(retrieveBmsSession('offline-session')).rejects.toThrow(
      'Unable to connect to the session service.',
    );
  });

  it('throws timeout message on AbortError', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError');
    fetchMock.mockRejectedValue(abortError);

    await expect(retrieveBmsSession('timeout-session')).rejects.toThrow(
      /Session retrieval timed out/,
    );
  });
});

// ---------------------------------------------------------------------------
// extractConnectionConfig
// ---------------------------------------------------------------------------

describe('extractConnectionConfig', () => {
  it('extracts apiUrl and bearerToken from user_info', () => {
    const response = createSampleResponse();
    const config = extractConnectionConfig(response);

    expect(config.apiUrl).toBe('https://bms.hospital.com');
    expect(config.bearerToken).toBe('bearer-token-abc');
    expect(config.appIdentifier).toBe(APP_IDENTIFIER);
    expect(config.databaseType).toBe('mysql');
  });

  it('falls back to key_value when bms_session_code is missing', () => {
    const response = createSampleResponse();
    // Remove bms_session_code
    if (response.result?.user_info) {
      response.result.user_info.bms_session_code = undefined;
    }

    const config = extractConnectionConfig(response);

    expect(config.bearerToken).toBe('fallback-key-value');
  });

  it('throws when apiUrl (bms_url) is missing', () => {
    const response = createSampleResponse();
    if (response.result?.user_info) {
      response.result.user_info.bms_url = undefined;
    }

    expect(() => extractConnectionConfig(response)).toThrow(
      /BMS API URL is missing/,
    );
  });

  it('throws when both bms_session_code and key_value are missing', () => {
    const response = createSampleResponse();
    if (response.result?.user_info) {
      response.result.user_info.bms_session_code = undefined;
    }
    if (response.result) {
      response.result.key_value = undefined;
    }

    expect(() => extractConnectionConfig(response)).toThrow(
      /Bearer token is missing/,
    );
  });

  it('throws when result is missing entirely', () => {
    const response: BmsSessionResponse = {
      MessageCode: 1,
      Message: 'error',
      RequestTime: '2026-01-01T00:00:00Z',
    };

    expect(() => extractConnectionConfig(response)).toThrow(
      /BMS API URL is missing/,
    );
  });
});

// ---------------------------------------------------------------------------
// extractUserInfo
// ---------------------------------------------------------------------------

describe('extractUserInfo', () => {
  it('maps snake_case fields to camelCase correctly', () => {
    const response = createSampleResponse();
    const userInfo = extractUserInfo(response);

    expect(userInfo.name).toBe('Dr. Smith');
    expect(userInfo.position).toBe('Physician');
    expect(userInfo.positionId).toBe(10);
    expect(userInfo.hospitalCode).toBe('H001');
    expect(userInfo.doctorCode).toBe('D001');
    expect(userInfo.department).toBe('Internal Medicine');
    expect(userInfo.location).toBe('Building A');
    expect(userInfo.isHrAdmin).toBe(false);
    expect(userInfo.isDirector).toBe(true);
  });

  it('returns defaults when user_info is missing', () => {
    const response: BmsSessionResponse = {
      MessageCode: 0,
      Message: 'ok',
      RequestTime: '2026-01-01T00:00:00Z',
      result: {},
    };

    const userInfo = extractUserInfo(response);

    expect(userInfo.name).toBe('');
    expect(userInfo.positionId).toBe(0);
    expect(userInfo.isHrAdmin).toBe(false);
    expect(userInfo.isDirector).toBe(false);
  });

  it('returns defaults when result is missing', () => {
    const response: BmsSessionResponse = {
      MessageCode: 1,
      Message: 'error',
      RequestTime: '2026-01-01T00:00:00Z',
    };

    const userInfo = extractUserInfo(response);

    expect(userInfo.name).toBe('');
    expect(userInfo.position).toBe('');
    expect(userInfo.hospitalCode).toBe('');
  });
});

// ---------------------------------------------------------------------------
// extractSystemInfo
// ---------------------------------------------------------------------------

describe('extractSystemInfo', () => {
  it('extracts version and environment from system_info', () => {
    const response = createSampleResponse();
    const systemInfo = extractSystemInfo(response);

    expect(systemInfo.version).toBe('2.0.0');
    expect(systemInfo.environment).toBe('production');
  });

  it('returns empty strings when system_info is missing', () => {
    const response: BmsSessionResponse = {
      MessageCode: 0,
      Message: 'ok',
      RequestTime: '2026-01-01T00:00:00Z',
      result: {},
    };

    const systemInfo = extractSystemInfo(response);

    expect(systemInfo.version).toBe('');
    expect(systemInfo.environment).toBe('');
  });

  it('returns empty strings when result is missing', () => {
    const response: BmsSessionResponse = {
      MessageCode: 1,
      Message: 'error',
      RequestTime: '2026-01-01T00:00:00Z',
    };

    const systemInfo = extractSystemInfo(response);

    expect(systemInfo.version).toBe('');
    expect(systemInfo.environment).toBe('');
  });
});

// ---------------------------------------------------------------------------
// executeSqlViaApi
// ---------------------------------------------------------------------------

describe('executeSqlViaApi', () => {
  it('sends correct POST request with Bearer token and SQL body', async () => {
    const sqlResponse = createSqlApiResponse();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(sqlResponse),
    });

    const config = createConnectionConfig();
    await executeSqlViaApi('SELECT 1', config);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledOptions] = fetchMock.mock.calls[0];

    // URL includes a cache-busting `random` query param; match the prefix.
    expect(calledUrl).toMatch(/^https:\/\/bms\.hospital\.com\/api\/sql(\?|$)/);
    expect(calledOptions.method).toBe('POST');
    expect(calledOptions.headers).toEqual({
      Authorization: 'Bearer bearer-token-abc',
      'Content-Type': 'application/json',
    });

    const body = JSON.parse(calledOptions.body as string);
    expect(body.sql).toBe('SELECT 1');
    expect(body.app).toBe(APP_IDENTIFIER);
  });

  it('returns parsed SQL API response', async () => {
    const sqlResponse = createSqlApiResponse({
      data: [{ count: 42 }],
      record_count: 1,
    });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(sqlResponse),
    });

    const config = createConnectionConfig();
    const result = await executeSqlViaApi('SELECT COUNT(*) as count', config);

    expect(result.data).toEqual([{ count: 42 }]);
    expect(result.record_count).toBe(1);
    expect(result.MessageCode).toBe(0);
  });

  it('throws on HTTP 501 with unauthorized message', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 501,
    });

    const config = createConnectionConfig();

    await expect(executeSqlViaApi('SELECT 1', config)).rejects.toThrow(
      'Session unauthorized. Please reconnect with a valid session ID.',
    );
  });

  it('throws on other non-OK HTTP status with actionable message', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
    });

    const config = createConnectionConfig();

    await expect(executeSqlViaApi('SELECT 1', config)).rejects.toThrow(
      /SQL API returned HTTP 500/,
    );
  });

  it('throws user-friendly message on network error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const config = createConnectionConfig();

    await expect(executeSqlViaApi('SELECT 1', config)).rejects.toThrow(
      'Unable to connect to the BMS API.',
    );
  });

  it('throws timeout message on AbortError', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError');
    fetchMock.mockRejectedValue(abortError);

    const config = createConnectionConfig();

    await expect(executeSqlViaApi('SELECT 1', config)).rejects.toThrow(
      /Query timed out after 60 seconds/,
    );
  });

  it('forwards the marketplace token in the request body as `marketplace-token`', async () => {
    const sqlResponse = createSqlApiResponse();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(sqlResponse),
    });

    const config = createConnectionConfig();
    await executeSqlViaApi('SELECT 1', config, undefined, 'mkt-TOKEN-123');

    const [, calledOptions] = fetchMock.mock.calls[0];
    const body = JSON.parse(calledOptions.body as string);
    expect(body['marketplace-token']).toBe('mkt-TOKEN-123');
  });

  it('omits the `marketplace-token` key when no token is provided', async () => {
    const sqlResponse = createSqlApiResponse();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(sqlResponse),
    });

    const config = createConnectionConfig();
    await executeSqlViaApi('SELECT 1', config);

    const [, calledOptions] = fetchMock.mock.calls[0];
    const body = JSON.parse(calledOptions.body as string);
    expect(body).not.toHaveProperty('marketplace-token');
  });
});

// ---------------------------------------------------------------------------
// detectDatabaseType
// ---------------------------------------------------------------------------

describe('detectDatabaseType', () => {
  it('detects MySQL from VERSION() response', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve(
          createSqlApiResponse({ data: [{ version: 'MySQL 8.0.32' }] }),
        ),
    });

    const config = createConnectionConfig();
    const result = await detectDatabaseType(config);

    expect(result).toBe('mysql');
  });

  it('detects PostgreSQL from VERSION() response', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve(
          createSqlApiResponse({
            data: [{ version: 'PostgreSQL 16.4 on x86_64-pc-linux-gnu' }],
          }),
        ),
    });

    const config = createConnectionConfig();
    const result = await detectDatabaseType(config);

    expect(result).toBe('postgresql');
  });

  it('detects MariaDB as mysql', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve(
          createSqlApiResponse({
            data: [{ version: '10.11.8-MariaDB-0ubuntu0.24.04.1' }],
          }),
        ),
    });

    const config = createConnectionConfig();
    const result = await detectDatabaseType(config);

    expect(result).toBe('mysql');
  });

  it('falls back to mysql when VERSION() returns uppercase key', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve(
          createSqlApiResponse({
            data: [{ VERSION: 'PostgreSQL 15.0' }],
            field_name: ['VERSION'],
          }),
        ),
    });

    const config = createConnectionConfig();
    const result = await detectDatabaseType(config);

    expect(result).toBe('postgresql');
  });

  it('falls back to mysql when data array is empty', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve(
          createSqlApiResponse({ data: [], record_count: 0 }),
        ),
    });

    const config = createConnectionConfig();
    const result = await detectDatabaseType(config);

    expect(result).toBe('mysql');
  });

  it('falls back to mysql when data is undefined', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve(
          createSqlApiResponse({ data: undefined }),
        ),
    });

    const config = createConnectionConfig();
    const result = await detectDatabaseType(config);

    expect(result).toBe('mysql');
  });

  it('falls back to mysql on network error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const config = createConnectionConfig();
    const result = await detectDatabaseType(config);

    expect(result).toBe('mysql');
  });

  it('sends SELECT VERSION() as version query', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve(
          createSqlApiResponse({ data: [{ version: 'MySQL 8.0' }] }),
        ),
    });

    const config = createConnectionConfig();
    await detectDatabaseType(config);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.sql).toBe('SELECT VERSION() as version');
  });
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('BMS Session Constants', () => {
  it('PASTE_JSON_URL points to hosxp.net', () => {
    expect(PASTE_JSON_URL).toBe('https://hosxp.net/phapi/PasteJSON');
  });

  it('APP_IDENTIFIER is BMS.Dashboard.React', () => {
    expect(APP_IDENTIFIER).toBe('BMS.Dashboard.React');
  });
});
