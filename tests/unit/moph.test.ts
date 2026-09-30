// =============================================================================
// MOPH Promt notification module — unit tests
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildMophFlexBubble,
  getMophJwt,
  sendMophNotification,
  sendMophBulkNotification,
  validateMophCid,
  MOPH_SEND_NOW_URL,
  MOPH_UPLOAD_URL,
  MOPH_BULK_SEND_URL,
  MOPH_JWT_CACHE_MS,
  MOPH_BATCH_CAP,
  __resetMophJwtCacheForTests,
} from '@/services/moph';
import {
  setActiveSession,
  __resetActiveSessionForTests,
} from '@/services/activeSession';
import {
  __resetNotificationsForTests,
} from '@/services/notify';
import type { ConnectionConfig, MophFlexMessage } from '@/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeConfig(): ConnectionConfig {
  return {
    apiUrl: 'https://bms.example',
    bearerToken: 'bearer-JWT',
    databaseType: 'mysql',
    appIdentifier: 'Test',
  };
}

function installSession() {
  setActiveSession('SESS-GUID-1', makeConfig(), undefined);
}

const FAKE_JWT = 'eyJhbGciOiJIUzI1NiJ9.payload.signature';

function stubBmsFunctionJwt(jwt: string): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: () => Promise.resolve({
      MessageCode: 200,
      Message: 'OK',
      result: { result: jwt },
    }),
    text: () => Promise.resolve(''),
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  __resetActiveSessionForTests();
  __resetNotificationsForTests();
  __resetMophJwtCacheForTests();
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// buildMophFlexBubble
// ---------------------------------------------------------------------------

describe('buildMophFlexBubble', () => {
  it('returns a well-formed LINE Flex bubble with title, sub-header, body, and footer CTA', () => {
    const flex = buildMophFlexBubble({
      title: 'นัดหมาย',
      subHeader: 'โรงพยาบาลทดสอบ',
      text: 'คุณมีนัดพรุ่งนี้ 09:00',
      confirmUrl: 'https://example.com/confirm?id=42',
    });

    expect(flex.type).toBe('flex');
    expect(flex.altText).toBe('นัดหมาย');

    const bubble = flex.contents as Record<string, unknown>;
    expect(bubble.type).toBe('bubble');
    expect(bubble.size).toBe('mega');

    const body = bubble.body as Record<string, unknown>;
    const bands = body.contents as Array<Record<string, unknown>>;
    // Header band — blue (#1E88E5) with the title
    expect(bands[0].backgroundColor).toBe('#1E88E5');
    const header = (bands[0].contents as Array<Record<string, unknown>>)[0];
    expect(header.type).toBe('text');
    expect(header.text).toBe('นัดหมาย');

    // Sub-header band — grey (#F5F5F5) with the sub-header
    expect(bands[1].backgroundColor).toBe('#F5F5F5');

    // Body band — grey with the text
    expect(bands[2].backgroundColor).toBe('#F5F5F5');
    const bodyText = (bands[2].contents as Array<Record<string, unknown>>)[0];
    expect(bodyText.text).toBe('คุณมีนัดพรุ่งนี้ 09:00');

    // Footer — uri button with confirm URL
    const footer = bubble.footer as Record<string, unknown>;
    const button = (footer.contents as Array<Record<string, unknown>>)[0];
    const action = button.action as Record<string, unknown>;
    expect(action.type).toBe('uri');
    expect(action.uri).toBe('https://example.com/confirm?id=42');
  });

  it('accepts an icon next to the sub-header when iconUrl is provided', () => {
    const flex = buildMophFlexBubble({
      title: 't',
      subHeader: 'sub',
      text: 'body',
      confirmUrl: 'https://ex.com',
      iconUrl: 'https://ex.com/icon.png',
    });
    const bands = (flex.contents as Record<string, unknown>).body as Record<string, unknown>;
    const subContents = ((bands.contents as Array<Record<string, unknown>>)[1].contents) as Array<Record<string, unknown>>;
    expect(subContents.some((c) => c.type === 'image' && c.url === 'https://ex.com/icon.png')).toBe(true);
  });

  it('honours altText override and custom band colours', () => {
    const flex = buildMophFlexBubble({
      title: 't',
      text: 'b',
      confirmUrl: 'https://ex.com',
      altText: 'custom-alt',
      headerColor: '#FF0000',
      bodyColor: '#00FF00',
    });
    expect(flex.altText).toBe('custom-alt');
    const bands = (flex.contents as Record<string, unknown>).body as Record<string, unknown>;
    const list = bands.contents as Array<Record<string, unknown>>;
    expect(list[0].backgroundColor).toBe('#FF0000');
    // When no subHeader+icon, the sub band is omitted — body band uses custom colour.
    expect(list[list.length - 1].backgroundColor).toBe('#00FF00');
  });
});

// ---------------------------------------------------------------------------
// validateMophCid
// ---------------------------------------------------------------------------

describe('validateMophCid', () => {
  it('accepts exactly 13 digits', () => {
    expect(() => validateMophCid('3320500282121')).not.toThrow();
  });

  it('rejects too-short CIDs', () => {
    expect(() => validateMophCid('123456789012')).toThrow(/13 digits/);
  });

  it('rejects too-long CIDs', () => {
    expect(() => validateMophCid('33205002821210')).toThrow(/13 digits/);
  });

  it('rejects non-digit characters', () => {
    expect(() => validateMophCid('33205-0028212')).toThrow(/13 digits/);
  });
});

// ---------------------------------------------------------------------------
// getMophJwt
// ---------------------------------------------------------------------------

describe('getMophJwt', () => {
  it('throws when no active BMS session is present', async () => {
    await expect(getMophJwt()).rejects.toThrow(/active BMS session/);
  });

  it('calls /api/function?name=get_moph_jwt with the session bearer and returns result.result', async () => {
    installSession();
    fetchMock.mockImplementation(stubBmsFunctionJwt(FAKE_JWT));

    const jwt = await getMophJwt();

    expect(jwt).toBe(FAKE_JWT);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toContain('https://bms.example/api/function?name=get_moph_jwt');
    expect(opts.method).toBe('POST');
    expect(opts.headers.Authorization).toBe('Bearer bearer-JWT');
  });

  it('caches the JWT for 23 hours — second call does not hit the network', async () => {
    installSession();
    fetchMock.mockImplementation(stubBmsFunctionJwt(FAKE_JWT));

    const first = await getMophJwt();
    const second = await getMophJwt();

    expect(first).toBe(FAKE_JWT);
    expect(second).toBe(FAKE_JWT);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('honours force:true and re-fetches past the TTL', async () => {
    installSession();
    fetchMock.mockImplementation(stubBmsFunctionJwt(FAKE_JWT));
    await getMophJwt();

    // Force a refresh — should re-fetch.
    fetchMock.mockImplementation(stubBmsFunctionJwt('new-jwt'));
    const jwt2 = await getMophJwt({ force: true });
    expect(jwt2).toBe('new-jwt');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('also accepts the JWT when the server returns it in Value', async () => {
    installSession();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () => Promise.resolve({ MessageCode: 200, Message: 'OK', Value: 'jwt-in-Value' }),
      text: () => Promise.resolve(''),
    });
    expect(await getMophJwt()).toBe('jwt-in-Value');
  });

  it('throws when the server returns an empty JWT', async () => {
    installSession();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () => Promise.resolve({ MessageCode: 200, Message: 'OK', result: {} }),
      text: () => Promise.resolve(''),
    });
    await expect(getMophJwt()).rejects.toThrow(/empty JWT|not be enabled/);
  });

  it('cache TTL constant is exactly 23 hours', () => {
    expect(MOPH_JWT_CACHE_MS).toBe(23 * 60 * 60 * 1000);
  });
});

// ---------------------------------------------------------------------------
// sendMophNotification — single
// ---------------------------------------------------------------------------

const FLEX: MophFlexMessage = {
  type: 'flex',
  altText: 'x',
  contents: { type: 'bubble' },
};

describe('sendMophNotification', () => {
  it('POSTs to send-now with Bearer JWT, correct body shape, and reports success', async () => {
    installSession();
    // 1st fetch → get_moph_jwt; 2nd fetch → send-now
    fetchMock
      .mockImplementationOnce(stubBmsFunctionJwt(FAKE_JWT))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: () => Promise.resolve('{"status":"success","code":0}'),
      });

    const result = await sendMophNotification({
      serviceId: 'svc-1',
      cid: '3320500282121',
      message: FLEX,
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe(200);

    const [url, opts] = fetchMock.mock.calls[1] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe(MOPH_SEND_NOW_URL);
    expect(opts.method).toBe('POST');
    expect(opts.headers.Authorization).toBe(`Bearer ${FAKE_JWT}`);
    expect(opts.headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(opts.body as string);
    expect(body).toEqual({
      service_id: 'svc-1',
      datas: ['3320500282121'],
      messages: [FLEX],
    });
  });

  it('marks success=false when body does not contain "success"', async () => {
    installSession();
    fetchMock
      .mockImplementationOnce(stubBmsFunctionJwt(FAKE_JWT))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: () => Promise.resolve('{"status":"queued"}'),
      });

    const result = await sendMophNotification({
      serviceId: 'svc-1',
      cid: '3320500282121',
      message: FLEX,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe(200);
  });

  it('marks success=false on non-200', async () => {
    installSession();
    fetchMock
      .mockImplementationOnce(stubBmsFunctionJwt(FAKE_JWT))
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        headers: new Headers(),
        text: () => Promise.resolve('upstream gone'),
      });

    const result = await sendMophNotification({
      serviceId: 'svc-1',
      cid: '3320500282121',
      message: FLEX,
    });
    expect(result.success).toBe(false);
    expect(result.status).toBe(503);
  });

  it('rejects a CID that is not 13 digits before any network call', async () => {
    installSession();
    await expect(
      sendMophNotification({ serviceId: 'svc-1', cid: '123', message: FLEX }),
    ).rejects.toThrow(/13 digits/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// sendMophBulkNotification
// ---------------------------------------------------------------------------

describe('sendMophBulkNotification', () => {
  it('uploads CIDs then sends using the returned file_id', async () => {
    installSession();
    fetchMock
      .mockImplementationOnce(stubBmsFunctionJwt(FAKE_JWT))                         // get_moph_jwt
      .mockResolvedValueOnce({                                                       // upload-data-json
        ok: true,
        status: 200,
        headers: new Headers(),
        text: () => Promise.resolve('{"file_id":"F-42","status":"success"}'),
      })
      .mockResolvedValueOnce({                                                       // send-message
        ok: true,
        status: 200,
        headers: new Headers(),
        text: () => Promise.resolve('{"status":"success"}'),
      });

    const result = await sendMophBulkNotification({
      serviceId: 'svc-1',
      cids: ['3320500282121', '3320500282122'],
      message: FLEX,
    });

    expect(result.uploaded.file_id).toBe('F-42');
    expect(result.send.success).toBe(true);

    const [uploadUrl, uploadOpts] = fetchMock.mock.calls[1] as [string, RequestInit & { headers: Record<string, string> }];
    expect(uploadUrl).toBe(MOPH_UPLOAD_URL);
    expect(uploadOpts.headers.Authorization).toBe(`Bearer ${FAKE_JWT}`);
    const uploadBody = JSON.parse(uploadOpts.body as string);
    expect(uploadBody).toEqual({
      service_id: 'svc-1',
      datas: ['3320500282121', '3320500282122'],
    });

    const [sendUrl, sendOpts] = fetchMock.mock.calls[2] as [string, RequestInit & { headers: Record<string, string> }];
    expect(sendUrl).toBe(MOPH_BULK_SEND_URL);
    const sendBody = JSON.parse(sendOpts.body as string);
    expect(sendBody).toEqual({
      service_id: 'svc-1',
      file_id: 'F-42',
      messages: [FLEX],
    });
  });

  it('rejects an empty cid list before any network call', async () => {
    installSession();
    await expect(
      sendMophBulkNotification({ serviceId: 'svc-1', cids: [], message: FLEX }),
    ).rejects.toThrow(/at least one CID|required/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a batch exceeding the 10,000 cap before any network call', async () => {
    installSession();
    const cids = Array.from({ length: MOPH_BATCH_CAP + 1 }, () => '3320500282121');
    await expect(
      sendMophBulkNotification({ serviceId: 'svc-1', cids, message: FLEX }),
    ).rejects.toThrow(/10000|cap|exceeds/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects when any CID in the batch is invalid', async () => {
    installSession();
    await expect(
      sendMophBulkNotification({
        serviceId: 'svc-1',
        cids: ['3320500282121', 'bad-one'],
        message: FLEX,
      }),
    ).rejects.toThrow(/13 digits/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws when the upload response omits file_id', async () => {
    installSession();
    fetchMock
      .mockImplementationOnce(stubBmsFunctionJwt(FAKE_JWT))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: () => Promise.resolve('{"status":"success"}'),
      });

    await expect(
      sendMophBulkNotification({
        serviceId: 'svc-1',
        cids: ['3320500282121'],
        message: FLEX,
      }),
    ).rejects.toThrow(/file_id/);
  });
});
