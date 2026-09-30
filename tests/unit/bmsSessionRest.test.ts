// =============================================================================
// REST CRUD + Function helper unit tests
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ConnectionConfig } from '@/types';
import {
  restInsert,
  restUpdate,
  restDelete,
  callBmsFunction,
  getSerialNumber,
  getHosVariable,
  setHosVariable,
  getServerDateTime,
  getNewGuid,
  getNewHn,
  getHospitalInfo,
  getPatientInfo,
  getPatientVisitInfo,
  getPatientAge,
  validateHn,
  validateVn,
  validateAn,
  validateCid,
  getIcd10Name,
} from '@/services/bmsSession';
import { __resetActiveSessionForTests } from '@/services/activeSession';

function createConfig(): ConnectionConfig {
  return {
    apiUrl: 'https://bms.example.com',
    bearerToken: 'bearer-abc',
    databaseType: 'mysql',
    appIdentifier: 'TestApp',
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  __resetActiveSessionForTests();
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// restInsert
// ---------------------------------------------------------------------------

describe('restInsert', () => {
  it('POSTs to /api/rest/{table} with Bearer auth and JSON body', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          MessageCode: 201,
          Message: 'Created',
          insert_count: 1,
        }),
    });

    const result = await restInsert('oapp', { hn: 'HN1', doctor: 'D1' }, createConfig());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toMatch(/^https:\/\/bms\.example\.com\/api\/rest\/oapp(\?|$)/);
    expect(opts.method).toBe('POST');
    expect(opts.headers.Authorization).toBe('Bearer bearer-abc');
    const body = JSON.parse(opts.body as string);
    expect(body).toEqual({ hn: 'HN1', doctor: 'D1' });
    expect(result.insert_count).toBe(1);
  });

  it('merges marketplace-token into the body when provided', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ MessageCode: 201, Message: 'Created' }),
    });

    await restInsert('oapp', { hn: 'HN1' }, createConfig(), 'mkt-1');

    const [, opts] = fetchMock.mock.calls[0];
    const body = JSON.parse(opts.body as string);
    expect(body['marketplace-token']).toBe('mkt-1');
    expect(body.hn).toBe('HN1');
  });

  it('throws a REST-prefixed error on non-ok response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ Message: 'Forbidden' }),
      text: () => Promise.resolve('Forbidden'),
    });

    await expect(
      restInsert('oapp', { hn: 'HN1' }, createConfig()),
    ).rejects.toThrow(/REST POST oapp:/);
  });
});

// ---------------------------------------------------------------------------
// restUpdate
// ---------------------------------------------------------------------------

describe('restUpdate', () => {
  it('PUTs to /api/rest/{table}/{id} with the resourceId in the path', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ MessageCode: 200, Message: 'OK', update_count: 1 }),
    });

    await restUpdate('patient', 'HN0001', { fname: 'Updated' }, createConfig(), 'mkt-1');

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toMatch(/^https:\/\/bms\.example\.com\/api\/rest\/patient\/HN0001(\?|$)/);
    expect(opts.method).toBe('PUT');
    const body = JSON.parse(opts.body as string);
    expect(body['marketplace-token']).toBe('mkt-1');
    expect(body.fname).toBe('Updated');
  });

  it('URL-encodes special characters in tableName and resourceId', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ MessageCode: 200, Message: 'OK' }),
    });

    await restUpdate('oapp', 'id/with slash', { x: 1 }, createConfig());

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('/oapp/id%2Fwith%20slash');
  });
});

// ---------------------------------------------------------------------------
// restDelete
// ---------------------------------------------------------------------------

describe('restDelete', () => {
  it('DELETEs with marketplace-token as a query parameter (not body)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ MessageCode: 200, Message: 'Deleted', delete_count: 1 }),
    });

    await restDelete('oapp', 'A123', createConfig(), 'mkt-1');

    const [url, opts] = fetchMock.mock.calls[0];
    expect(opts.method).toBe('DELETE');
    expect(opts.body).toBeUndefined();
    expect(url).toContain('marketplace-token=mkt-1');
    expect(url).toMatch(/^https:\/\/bms\.example\.com\/api\/rest\/oapp\/A123\?/);
  });

  it('omits the marketplace-token query param when no token is provided', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ MessageCode: 200, Message: 'Deleted' }),
    });

    await restDelete('oapp', 'A123', createConfig());

    const [url] = fetchMock.mock.calls[0];
    expect(url).not.toContain('marketplace-token');
  });
});

// ---------------------------------------------------------------------------
// callBmsFunction
// ---------------------------------------------------------------------------

describe('callBmsFunction', () => {
  it('POSTs to /api/function?name={fn} with payload in body', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ MessageCode: 200, Message: 'OK', Value: 123 }),
    });

    const res = await callBmsFunction('get_serialnumber', createConfig(), {
      serial_name: 'x',
      table_name: 'x',
      field_name: 'x',
    });

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toMatch(
      /^https:\/\/bms\.example\.com\/api\/function\?name=get_serialnumber(&|$)/,
    );
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body as string);
    expect(body).toEqual({ serial_name: 'x', table_name: 'x', field_name: 'x' });
    expect(res.Value).toBe(123);
  });

  it('URL-encodes function names with special chars', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ MessageCode: 200, Message: 'OK' }),
    });

    await callBmsFunction('name with space', createConfig());

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('name=name%20with%20space');
  });

  it('throws when the body reports MessageCode >= 400', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          MessageCode: 500,
          Message: 'Invalid Key data for get_serialnumber table_name',
        }),
    });

    await expect(
      callBmsFunction('get_serialnumber', createConfig(), { serial_name: 'x' }),
    ).rejects.toThrow(/Invalid Key data/);
  });

  it('throws "Session unauthorized" on HTTP 501', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 501,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
    });

    await expect(
      callBmsFunction('get_hosvariable', createConfig(), { variable_name: 'X' }),
    ).rejects.toThrow('Session unauthorized. Please reconnect with a valid session ID.');
  });
});

// ---------------------------------------------------------------------------
// getSerialNumber / getHosVariable wrappers
// ---------------------------------------------------------------------------

describe('getSerialNumber', () => {
  it('returns the numeric Value from the function response', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ MessageCode: 200, Message: 'OK', Value: 1234567 }),
    });

    const id = await getSerialNumber(createConfig(), 'refill_order_id', 'refill_order', 'order_id');
    expect(id).toBe(1234567);
  });

  it('throws when Value is not a finite number', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ MessageCode: 200, Message: 'OK', Value: 'not-a-number' }),
    });

    await expect(
      getSerialNumber(createConfig(), 'x', 'x', 'x'),
    ).rejects.toThrow(/non-numeric value/);
  });
});

describe('getHosVariable', () => {
  it('returns the stringified Value from the function response', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          MessageCode: 200,
          Message: 'OK',
          Value: 'โรงพยาบาลตัวอย่าง',
        }),
    });

    const name = await getHosVariable(createConfig(), 'HOSPITAL_NAME');
    expect(name).toBe('โรงพยาบาลตัวอย่าง');
  });

  it('returns empty string when Value is null', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ MessageCode: 200, Message: 'OK', Value: null }),
    });

    const result = await getHosVariable(createConfig(), 'NONEXISTENT');
    expect(result).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Extended /api/function wrappers
// ---------------------------------------------------------------------------

function okBody(body: Record<string, unknown>) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ MessageCode: 200, Message: 'OK', ...body }),
  };
}

describe('setHosVariable', () => {
  it('POSTs to /api/function?name=set_hosvariable with variable_name and variable_value', async () => {
    fetchMock.mockResolvedValue(okBody({}));
    await setHosVariable(createConfig(), 'SOME_FLAG', 'enabled');
    const [url, opts] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('name=set_hosvariable');
    const body = JSON.parse(opts.body as string);
    expect(body).toEqual({ variable_name: 'SOME_FLAG', variable_value: 'enabled' });
  });
});

describe('getServerDateTime / getNewGuid / getNewHn', () => {
  it('getServerDateTime maps server_datetime and server_date fields', async () => {
    fetchMock.mockResolvedValue(
      okBody({ server_datetime: '2026-04-23 10:30:00', server_date: '2026-04-23' }),
    );
    const res = await getServerDateTime(createConfig());
    expect(res.serverDateTime).toBe('2026-04-23 10:30:00');
    expect(res.serverDate).toBe('2026-04-23');
  });

  it('getNewGuid returns the Value field stringified', async () => {
    fetchMock.mockResolvedValue(okBody({ Value: '{ABCD-1234}' }));
    expect(await getNewGuid(createConfig())).toBe('{ABCD-1234}');
  });

  it('getNewHn returns empty string when Value is null', async () => {
    fetchMock.mockResolvedValue(okBody({ Value: null }));
    expect(await getNewHn(createConfig())).toBe('');
  });
});

describe('getHospitalInfo', () => {
  it('maps snake_case fields to camelCase', async () => {
    fetchMock.mockResolvedValue(
      okBody({
        hospital_code: 'H00000',
        hospital_name: 'โรงพยาบาลตัวอย่าง',
        hospital_name_eng: 'Example Hospital',
        hospital_address: '123 Main',
        hospital_tel: '02-000-0000',
        hospital_province: 'กรุงเทพฯ',
      }),
    );
    const info = await getHospitalInfo(createConfig());
    expect(info.hospitalCode).toBe('H00000');
    expect(info.hospitalNameEng).toBe('Example Hospital');
    expect(info.hospitalProvince).toBe('กรุงเทพฯ');
  });
});

describe('getPatientInfo / getPatientVisitInfo', () => {
  it('returns the `data` object for a known patient', async () => {
    fetchMock.mockResolvedValue(
      okBody({ data: { hn: 'HN001', fname: 'John', lname: 'Doe' } }),
    );
    const p = await getPatientInfo(createConfig(), 'HN001');
    expect(p).toEqual({ hn: 'HN001', fname: 'John', lname: 'Doe' });
  });

  it('returns null when `data` is absent or non-object', async () => {
    fetchMock.mockResolvedValue(okBody({}));
    expect(await getPatientInfo(createConfig(), 'MISSING')).toBeNull();
  });

  it('getPatientVisitInfo POSTs with vn', async () => {
    fetchMock.mockResolvedValue(okBody({ data: { vn: '670423001' } }));
    await getPatientVisitInfo(createConfig(), '670423001');
    const [, opts] = fetchMock.mock.calls[0];
    expect(JSON.parse(opts.body as string)).toEqual({ vn: '670423001' });
  });
});

describe('getPatientAge', () => {
  it('returns the numeric age from Value', async () => {
    fetchMock.mockResolvedValue(okBody({ Value: 42 }));
    expect(await getPatientAge(createConfig(), 'HN001')).toBe(42);
  });

  it('falls back to age_year when Value is missing', async () => {
    fetchMock.mockResolvedValue(okBody({ age_year: 65 }));
    expect(await getPatientAge(createConfig(), 'HN001')).toBe(65);
  });

  it('passes ref_date when provided', async () => {
    fetchMock.mockResolvedValue(okBody({ Value: 30 }));
    await getPatientAge(createConfig(), 'HN001', '2020-01-01');
    const [, opts] = fetchMock.mock.calls[0];
    expect(JSON.parse(opts.body as string)).toEqual({
      hn: 'HN001',
      ref_date: '2020-01-01',
    });
  });

  it('omits ref_date when not provided', async () => {
    fetchMock.mockResolvedValue(okBody({ Value: 30 }));
    await getPatientAge(createConfig(), 'HN001');
    const [, opts] = fetchMock.mock.calls[0];
    expect(JSON.parse(opts.body as string)).toEqual({ hn: 'HN001' });
  });
});

describe('identifier validators', () => {
  it.each([
    ['validate_hn', 'hn', 'HN001', validateHn],
    ['validate_vn', 'vn', '670423001', validateVn],
    ['validate_an', 'an', '670423999', validateAn],
    ['validate_cid', 'cid', '1234567890123', validateCid],
  ])('%s sends the right key and returns boolean', async (fn, key, value, wrapper) => {
    fetchMock.mockResolvedValue(okBody({ valid: true }));
    const result = await wrapper(createConfig(), value);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(`name=${fn}`);
    expect(JSON.parse(opts.body as string)).toEqual({ [key]: value });
    expect(result).toBe(true);
  });

  it('returns false when valid is falsy or missing', async () => {
    fetchMock.mockResolvedValue(okBody({ valid: false }));
    expect(await validateCid(createConfig(), '0')).toBe(false);

    fetchMock.mockResolvedValue(okBody({}));
    expect(await validateCid(createConfig(), '0')).toBe(false);
  });
});

describe('getIcd10Name', () => {
  it('returns both English and Thai names', async () => {
    fetchMock.mockResolvedValue(
      okBody({ name: 'Essential hypertension', thai_name: 'ความดันโลหิตสูง' }),
    );
    const r = await getIcd10Name(createConfig(), 'I10');
    expect(r.name).toBe('Essential hypertension');
    expect(r.thaiName).toBe('ความดันโลหิตสูง');
  });

  it('defaults both to empty string when missing', async () => {
    fetchMock.mockResolvedValue(okBody({}));
    const r = await getIcd10Name(createConfig(), 'UNKNOWN');
    expect(r).toEqual({ name: '', thaiName: '' });
  });
});
