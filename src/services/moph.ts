// =============================================================================
// MOPH Promt notification support — morpromt2c.moph.go.th
//
// Sends LINE-Flex-style notifications to citizens via the Thai Ministry of
// Public Health's Promt platform. Auth is a MOPH-issued JWT obtained through
// the BMS-side `/api/function?name=get_moph_jwt` server function (which
// itself talks to the MOPH token endpoint server-side — credentials never
// leave the BMS process). We cache the JWT for 23 h in-process per spec §1.
//
// Endpoints used:
//   - BMS `/api/function?name=get_moph_jwt`        → returns the MOPH JWT
//   - morpromt2c /api/v2/send-message/send-now         (single CID)
//   - morpromt2c /api/v2/send-message/upload-data-json (bulk step A)
//   - morpromt2c /api/v2/send-message/send-message     (bulk step B)
//
// Failures are normalised and surfaced through the shared notify system to
// match the UX of llm.ts / bmsSession.ts.
// =============================================================================

import type {
  BmsFunctionResponse,
  ConnectionConfig,
  MophFlexBubbleInput,
  MophFlexMessage,
  MophSendResult,
  MophUploadResponse,
} from '@/types';
import { callBmsFunction } from '@/services/bmsSession';
import { getActiveConfig } from '@/services/activeSession';
import { notifyError, notifyWarning } from '@/services/notify';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Base URL of the MOPH Promt send-message API. */
export const MOPH_PROMT_BASE =
  'https://morpromt2c.moph.go.th/api/v2/send-message';

export const MOPH_SEND_NOW_URL = `${MOPH_PROMT_BASE}/send-now`;
export const MOPH_UPLOAD_URL = `${MOPH_PROMT_BASE}/upload-data-json`;
export const MOPH_BULK_SEND_URL = `${MOPH_PROMT_BASE}/send-message`;

/** JWT cache TTL — spec §1 mandates 23 hours. */
export const MOPH_JWT_CACHE_MS = 23 * 60 * 60 * 1000;

/** Per-request timeout for MOPH calls (spec §4). */
export const MOPH_TIMEOUT_MS = 30_000;

/** Maximum CIDs allowed in a bulk upload (spec §4). */
export const MOPH_BATCH_CAP = 10_000;

/** CID must be exactly 13 digits (Thai national-ID format; spec §4). */
export const MOPH_CID_PATTERN = /^\d{13}$/;

// ---------------------------------------------------------------------------
// In-process JWT cache
// ---------------------------------------------------------------------------

interface JwtCacheEntry {
  jwt: string;
  expiresAt: number;
}

let jwtCache: JwtCacheEntry | null = null;

/** Test helper — wipe the cached MOPH JWT between cases. */
export function __resetMophJwtCacheForTests(): void {
  jwtCache = null;
}

// ---------------------------------------------------------------------------
// Error / notification plumbing
// ---------------------------------------------------------------------------

function normaliseMophError(error: unknown, timeoutSec: number): Error {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new Error(`MOPH request timed out after ${timeoutSec}s`, {
      cause: error,
    });
  }
  if (error instanceof Error) return error;
  return new Error('Unable to reach MOPH Promt service. Please check your connection.', {
    cause: error,
  });
}

function notifyMophFailure(context: string, err: Error): void {
  if (err.message.startsWith('Session unauthorized')) return;
  if (err.message.startsWith('มีการร้องขอบ่อยเกินไป')) {
    notifyWarning(err.message);
    return;
  }
  notifyError(`${context}: ${err.message}`);
}

// ---------------------------------------------------------------------------
// CID validation
// ---------------------------------------------------------------------------

/**
 * Validate a single Thai 13-digit CID. Throws a descriptive `Error` if the
 * value does not match `^\d{13}$`. Exported so callers can reject user input
 * before queueing an async send.
 */
export function validateMophCid(cid: string): void {
  if (!MOPH_CID_PATTERN.test(cid)) {
    throw new Error(`Invalid CID "${cid}" — expected exactly 13 digits.`);
  }
}

function validateMophCidBatch(cids: readonly string[]): void {
  if (!Array.isArray(cids) || cids.length === 0) {
    throw new Error('At least one CID is required.');
  }
  if (cids.length > MOPH_BATCH_CAP) {
    throw new Error(
      `Too many CIDs: ${cids.length} exceeds the ${MOPH_BATCH_CAP}-entry batch cap.`,
    );
  }
  for (const cid of cids) validateMophCid(cid);
}

// ---------------------------------------------------------------------------
// JWT retrieval — wraps BMS /api/function?name=get_moph_jwt
// ---------------------------------------------------------------------------

function requireActiveConfig(): ConnectionConfig {
  const cfg = getActiveConfig();
  if (!cfg) {
    throw new Error(
      'MOPH notification requires an active BMS session. Connect a session before calling the MOPH API.',
    );
  }
  return cfg;
}

/**
 * Defensive JWT extraction. The spec's response field is `result`, but the
 * BMS function envelope wraps everything in `result` already — so the JWT
 * may arrive as either `response.result` (string) or `response.result.result`
 * (nested). Some generic functions use `Value` for scalar returns, so we
 * accept that too. Returns `null` when no plausible string was found.
 */
function extractJwtFromResponse(resp: BmsFunctionResponse): string | null {
  const candidates: unknown[] = [resp.result, resp.Value];
  if (resp.result && typeof resp.result === 'object') {
    const nested = resp.result as Record<string, unknown>;
    candidates.push(nested.result, nested.jwt, nested.access_token, nested.Value);
  }
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 0) return c;
  }
  return null;
}

export interface GetMophJwtOptions {
  /** Bypass the 23-hour cache and force a fresh fetch. */
  force?: boolean;
}

/**
 * Return the MOPH Promt JWT, fetching it via `/api/function?name=get_moph_jwt`
 * the first time and re-using the cached value for up to 23 h thereafter.
 *
 * Requires an active BMS session to be set — the BMS side handles MOPH
 * credentials server-side, so this function never sees the username /
 * password hash / hospital code from the spec §1 payload.
 *
 * @throws {Error} When no active session, when the BMS function fails, or
 *   when the function is not registered on the current tunnel (it is listed
 *   as "restricted" in the docs and may not be enabled on every site).
 */
export async function getMophJwt(options: GetMophJwtOptions = {}): Promise<string> {
  const now = Date.now();
  if (!options.force && jwtCache && jwtCache.expiresAt > now) {
    return jwtCache.jwt;
  }

  const config = requireActiveConfig();
  const resp = await callBmsFunction('get_moph_jwt', config, {});
  const jwt = extractJwtFromResponse(resp);
  if (!jwt) {
    throw new Error(
      'get_moph_jwt returned an empty JWT — this function may not be enabled on the current BMS tunnel.',
    );
  }
  jwtCache = { jwt, expiresAt: now + MOPH_JWT_CACHE_MS };
  return jwt;
}

// ---------------------------------------------------------------------------
// LINE Flex builder
// ---------------------------------------------------------------------------

/**
 * Build a LINE Flex bubble matching the shape in spec §5: three stacked
 * bands (header / optional sub-header with icon / body text) plus a footer
 * CTA button that opens `confirmUrl`.
 *
 * @example
 *   const flex = buildMophFlexBubble({
 *     title: 'นัดหมาย',
 *     subHeader: 'รพ. ทดสอบระบบ',
 *     text: 'คุณมีนัดพรุ่งนี้ 09:00',
 *     confirmUrl: 'https://app.example/confirm?id=42',
 *     iconUrl: 'https://app.example/icon.png',
 *   });
 */
export function buildMophFlexBubble(input: MophFlexBubbleInput): MophFlexMessage {
  const headerColor = input.headerColor ?? '#1E88E5';
  const bodyColor = input.bodyColor ?? '#F5F5F5';
  const confirmLabel = input.confirmLabel ?? 'ยืนยัน';

  const bands: Array<Record<string, unknown>> = [];

  // Header band — title on a coloured bar.
  bands.push({
    type: 'box',
    layout: 'vertical',
    backgroundColor: headerColor,
    paddingAll: 'md',
    contents: [
      {
        type: 'text',
        text: input.title,
        weight: 'bold',
        size: 'lg',
        color: '#FFFFFF',
        wrap: true,
      },
    ],
  });

  // Sub-header band — only when at least one of iconUrl / subHeader is set.
  if (input.iconUrl || input.subHeader) {
    const subContents: Array<Record<string, unknown>> = [];
    if (input.iconUrl) {
      subContents.push({
        type: 'image',
        url: input.iconUrl,
        size: 'sm',
        flex: 0,
        aspectMode: 'fit',
      });
    }
    if (input.subHeader) {
      subContents.push({
        type: 'text',
        text: input.subHeader,
        weight: 'bold',
        wrap: true,
        flex: 1,
      });
    }
    bands.push({
      type: 'box',
      layout: 'horizontal',
      backgroundColor: bodyColor,
      paddingAll: 'md',
      spacing: 'sm',
      contents: subContents,
    });
  }

  // Body band — the main text paragraph.
  bands.push({
    type: 'box',
    layout: 'vertical',
    backgroundColor: bodyColor,
    paddingAll: 'md',
    contents: [
      {
        type: 'text',
        text: input.text,
        wrap: true,
      },
    ],
  });

  return {
    type: 'flex',
    altText: input.altText ?? input.title,
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: 'none',
        spacing: 'none',
        contents: bands,
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            style: 'primary',
            action: {
              type: 'uri',
              label: confirmLabel,
              uri: input.confirmUrl,
            },
          },
        ],
      },
    },
  };
}

// ---------------------------------------------------------------------------
// MOPH HTTP helper
// ---------------------------------------------------------------------------

async function postMoph(
  url: string,
  jwt: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<MophSendResult> {
  const controller = new AbortController();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort());
  }
  const timeoutId = setTimeout(() => controller.abort(), MOPH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = undefined;
    }
    const success =
      response.status === 200 && text.toLowerCase().includes('success');
    return { success, status: response.status, body: text, parsed };
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Send — single CID (send-now)
// ---------------------------------------------------------------------------

export interface SendMophNotificationArgs {
  /** MOPH Promt service id registered for your app. */
  serviceId: string;
  /** 13-digit Thai citizen ID. */
  cid: string;
  /** LINE Flex message to deliver (use `buildMophFlexBubble` to construct). */
  message: MophFlexMessage;
  /** Optional AbortSignal to cancel the in-flight request. */
  signal?: AbortSignal;
}

/**
 * Send a LINE Flex notification to a single citizen immediately. Returns
 * `{ success, status, body, parsed }`; `success` is true only when the
 * response is HTTP 200 AND its body contains the literal substring "success"
 * (spec §2).
 *
 * @throws {Error} When the CID is malformed, when the JWT cannot be fetched,
 *   or when the MOPH endpoint is unreachable / times out.
 */
export async function sendMophNotification(
  args: SendMophNotificationArgs,
): Promise<MophSendResult> {
  validateMophCid(args.cid);
  try {
    const jwt = await getMophJwt();
    const result = await postMoph(
      MOPH_SEND_NOW_URL,
      jwt,
      {
        service_id: args.serviceId,
        datas: [args.cid],
        messages: [args.message],
      },
      args.signal,
    );
    return result;
  } catch (error: unknown) {
    const finalErr = normaliseMophError(error, MOPH_TIMEOUT_MS / 1000);
    notifyMophFailure('MOPH send-now', finalErr);
    throw finalErr;
  }
}

// ---------------------------------------------------------------------------
// Send — bulk (upload → send-message)
// ---------------------------------------------------------------------------

export interface SendMophBulkArgs {
  serviceId: string;
  cids: string[];
  message: MophFlexMessage;
  signal?: AbortSignal;
}

export interface SendMophBulkResult {
  uploaded: MophUploadResponse;
  send: MophSendResult;
}

function extractFileId(result: MophSendResult): string {
  const parsed = result.parsed as { file_id?: unknown } | undefined;
  if (parsed && typeof parsed.file_id === 'string' && parsed.file_id.length > 0) {
    return parsed.file_id;
  }
  throw new Error(
    `MOPH upload response did not include a file_id (status ${result.status}): ${result.body.slice(0, 200)}`,
  );
}

/**
 * Two-step bulk send (spec §3):
 *   A. POST `/upload-data-json` with the CID array → returns `{ file_id }`
 *   B. POST `/send-message` with that file_id and the flex payload
 *
 * Returns both responses so callers can audit the file_id and inspect the
 * send status. Per spec §4 the batch is capped at 10,000 CIDs — any larger
 * list is rejected client-side before any network call.
 */
export async function sendMophBulkNotification(
  args: SendMophBulkArgs,
): Promise<SendMophBulkResult> {
  validateMophCidBatch(args.cids);
  try {
    const jwt = await getMophJwt();

    // Step A — upload.
    const uploadResult = await postMoph(
      MOPH_UPLOAD_URL,
      jwt,
      { service_id: args.serviceId, datas: args.cids },
      args.signal,
    );
    const fileId = extractFileId(uploadResult);
    const uploaded: MophUploadResponse = {
      file_id: fileId,
      ...(uploadResult.parsed && typeof uploadResult.parsed === 'object'
        ? (uploadResult.parsed as Record<string, unknown>)
        : {}),
    };

    // Step B — send.
    const send = await postMoph(
      MOPH_BULK_SEND_URL,
      jwt,
      {
        service_id: args.serviceId,
        file_id: fileId,
        messages: [args.message],
      },
      args.signal,
    );

    return { uploaded, send };
  } catch (error: unknown) {
    const finalErr = normaliseMophError(error, MOPH_TIMEOUT_MS / 1000);
    notifyMophFailure('MOPH bulk send', finalErr);
    throw finalErr;
  }
}
