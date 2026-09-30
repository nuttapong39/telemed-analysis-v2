// =============================================================================
// BMS Session KPI Dashboard - BMS Session Service (T022)
// Core session retrieval, connection config extraction, and SQL execution
// =============================================================================

import type {
  BmsFunctionResponse,
  BmsSessionResponse,
  ConnectionConfig,
  DatabaseType,
  RestApiResponse,
  SqlApiRequest,
  SqlApiResponse,
  SqlParams,
  SystemInfo,
  UserInfo,
} from '@/types';

import { queryBuilder } from '@/services/queryBuilder';
import { apiQueue } from '@/services/apiQueue';
import {
  resolveConfig,
  resolveMarketplaceToken,
} from '@/services/activeSession';
import { notifyError, notifyWarning } from '@/services/notify';

// ---------------------------------------------------------------------------
// Error-notification helper
// ---------------------------------------------------------------------------

/**
 * Decide whether a thrown error should surface as a user-visible toast.
 *
 * Session-expiry errors are handled by the SessionExpired UI flow (the app
 * redirects to a dedicated screen), so toasting them would double-notify.
 * Rate-limit messages already include guidance, so we show them as warnings.
 * Everything else is an unexpected failure → error toast.
 */
function notifyApiFailure(context: string, error: unknown): void {
  const msg = error instanceof Error ? error.message : String(error);
  if (msg.startsWith('Session unauthorized')) {
    // SessionExpired component takes over — skip the toast.
    return;
  }
  if (msg.startsWith('มีการร้องขอบ่อยเกินไป')) {
    notifyWarning(msg);
    return;
  }
  notifyError(`${context}: ${msg}`);
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Public paste-JSON endpoint used to exchange session IDs for config. */
export const PASTE_JSON_URL = 'https://hosxp.net/phapi/PasteJSON';

/** Application identifier sent with every SQL query. */
export const APP_IDENTIFIER = 'BMS.Dashboard.React';

/** Timeout (ms) when retrieving the session payload. */
export const SESSION_TIMEOUT_MS = 30_000;

/** Timeout (ms) when executing a SQL query via the BMS API. */
export const QUERY_TIMEOUT_MS = 60_000;

/** Local HOSxP API gateway URL (users typically run it on the same machine). */
export const LOCAL_API_URL = 'http://127.0.0.1:45011';

/** Timeout (ms) for the local API probe — fast fail so it doesn't block connection. */
export const LOCAL_PROBE_TIMEOUT_MS = 3_000;

/**
 * Append a unique `&random=...` query param to an API URL so no intermediate
 * proxy, tunnel, or browser cache can short-circuit the request with a stale
 * response. Uses `?` when the URL has no query string yet, `&` otherwise.
 */
function withRandomParam(url: string): string {
  const sep = url.includes('?') ? '&' : '?';
  const rand = `${Date.now()}${Math.random().toString(36).slice(2, 10)}`;
  return `${url}${sep}random=${rand}`;
}

// ---------------------------------------------------------------------------
// Session retrieval
// ---------------------------------------------------------------------------

/**
 * Fetch the BMS session payload for the given session ID.
 *
 * @throws {Error} On network failure or non-OK HTTP status.
 */
export async function retrieveBmsSession(sessionId: string): Promise<BmsSessionResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SESSION_TIMEOUT_MS);

  try {
    const url = `${PASTE_JSON_URL}?Action=GET&code=${sessionId}`;
    const response = await fetch(url, { signal: controller.signal });

    if (response.status === 429) {
      let retryInfo = '';
      const retryAfter = response.headers.get('Retry-After');
      if (retryAfter) {
        retryInfo = ` กรุณารอ ${retryAfter} วินาทีแล้วลองใหม่`;
      }
      throw new Error(
        `มีการร้องขอบ่อยเกินไป (HTTP 429).${retryInfo} กรุณารอสักครู่แล้วลองใหม่อีกครั้ง`,
      );
    }

    if (!response.ok) {
      throw new Error(
        `Failed to retrieve session (HTTP ${response.status}). ` +
          'Please verify your session ID and try again.',
      );
    }

    const data: BmsSessionResponse = await response.json() as BmsSessionResponse;
    return data;
  } catch (error: unknown) {
    let finalErr: Error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      finalErr = new Error(
        `Session retrieval timed out after ${SESSION_TIMEOUT_MS / 1000} seconds. ` +
          'Please check your network connection and try again.',
        { cause: error },
      );
    } else if (
      error instanceof Error &&
      (error.message.startsWith('Failed to retrieve session') ||
        error.message.startsWith('มีการร้องขอบ่อยเกินไป'))
    ) {
      finalErr = error;
    } else {
      finalErr = new Error(
        'Unable to connect to the session service. ' +
          'Please check your internet connection and try again.',
        { cause: error },
      );
    }
    notifyApiFailure('Session retrieval', finalErr);
    throw finalErr;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Config & info extraction
// ---------------------------------------------------------------------------

/**
 * Build a {@link ConnectionConfig} from the raw session response.
 *
 * @throws {Error} When required fields (API URL, bearer token) are missing.
 */
export function extractConnectionConfig(response: BmsSessionResponse): ConnectionConfig {
  const userInfo = response.result?.user_info;

  const apiUrl = userInfo?.bms_url;
  if (!apiUrl) {
    throw new Error(
      'BMS API URL is missing from the session response. ' +
        'Please reconnect with a valid session ID.',
    );
  }

  const bearerToken = userInfo?.bms_session_code ?? response.result?.key_value;
  if (!bearerToken) {
    throw new Error(
      'Bearer token is missing from the session response. ' +
        'Please reconnect with a valid session ID.',
    );
  }

  return {
    apiUrl,
    bearerToken,
    appIdentifier: APP_IDENTIFIER,
    databaseType: 'mysql', // default; updated after VERSION query
  };
}

/**
 * Map the raw snake_case user-info payload to the camelCase
 * {@link UserInfo} interface.
 */
export function extractUserInfo(response: BmsSessionResponse): UserInfo {
  const raw = response.result?.user_info;

  return {
    name: raw?.name ?? '',
    position: raw?.position ?? '',
    positionId: raw?.position_id ?? 0,
    hospitalCode: raw?.hospital_code ?? '',
    doctorCode: raw?.doctor_code ?? '',
    department: raw?.department ?? '',
    location: raw?.location ?? '',
    isHrAdmin: raw?.is_hr_admin ?? false,
    isDirector: raw?.is_director ?? false,
  };
}

/**
 * Extract system-level metadata from the session response.
 */
export function extractSystemInfo(response: BmsSessionResponse): SystemInfo {
  const raw = response.result?.system_info;

  return {
    version: raw?.version ?? '',
    environment: raw?.environment ?? '',
  };
}

// ---------------------------------------------------------------------------
// SQL execution
// ---------------------------------------------------------------------------

/**
 * Execute an arbitrary SQL statement against the BMS API and return the raw
 * response.
 *
 * Use named placeholders (`:name`) in `sql` and supply matching entries in
 * `params` to bind values safely on the server side. The `params` object is
 * only included in the request body when at least one binding is provided.
 *
 * @example
 *   executeSqlViaApi(
 *     'SELECT * FROM patient WHERE hn = :hn',
 *     config,
 *     { hn: { value: '12345', value_type: 'string' } },
 *   );
 *
 * @throws {Error} On network failure, HTTP errors, or timeout.
 */
export async function executeSqlViaApi(
  sql: string,
  config: ConnectionConfig,
  params?: SqlParams,
  marketplaceToken?: string,
): Promise<SqlApiResponse> {
  // Prefer the active session's config so stale closures auto-heal after a
  // reconnect; same for the marketplace token.
  const eff = resolveConfig(config);
  const effMkt = resolveMarketplaceToken(marketplaceToken);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);

  try {
    const body: SqlApiRequest = { sql, app: eff.appIdentifier };
    if (params && Object.keys(params).length > 0) {
      body.params = params;
    }
    if (effMkt) {
      body['marketplace-token'] = effMkt;
    }

    const response = await fetch(withRandomParam(`${eff.apiUrl}/api/sql`), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${eff.bearerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (response.status === 429) {
      let retryInfo = '';
      const retryAfter = response.headers.get('Retry-After');
      if (retryAfter) {
        retryInfo = ` กรุณารอ ${retryAfter} วินาทีแล้วลองใหม่`;
      }
      // Try to get additional info from response body
      try {
        const errorData = (await response.json()) as {
          message?: string;
          error?: string;
        };
        const detail = errorData.message || errorData.error;
        if (detail) {
          retryInfo = `: ${detail}`;
        }
      } catch {
        // Ignore JSON parse errors
      }
      throw new Error(
        `มีการร้องขอบ่อยเกินไป (HTTP 429).${retryInfo} กรุณารอสักครู่แล้วลองใหม่อีกครั้ง`,
      );
    }

    // BMS tunnel uses HTTP 501 for several distinct failures (auth errors, SQL
    // errors, concurrency races). The real error lives in the JSON body's
    // Message/MessageCode fields, so always try to parse the body first and
    // distinguish the cases before falling back to generic handling.
    let parsedBody: SqlApiResponse | null = null;
    try {
      parsedBody = (await response.json()) as SqlApiResponse;
    } catch {
      // Body is not JSON — fall through to HTTP-status handling below.
    }

    // Treat any MessageCode >= 400 as an error (the BMS server uses 401 for
    // auth failures, 409 for SQL syntax errors, 500 for DB errors, etc.).
    // Success responses use MessageCode 200 in production and 0 in some test
    // fixtures — both are treated as success.
    if (
      parsedBody &&
      typeof parsedBody.MessageCode === 'number' &&
      parsedBody.MessageCode >= 400
    ) {
      const detail =
        parsedBody.Message || `MessageCode ${parsedBody.MessageCode}`;
      if (parsedBody.MessageCode === 401) {
        throw new Error(
          'Session unauthorized. Please reconnect with a valid session ID.',
        );
      }
      throw new Error(`Database error: ${detail}`);
    }

    if (response.status === 501) {
      throw new Error(
        'Session unauthorized. Please reconnect with a valid session ID.',
      );
    }

    if (!response.ok) {
      throw new Error(
        `SQL API returned HTTP ${response.status}. ` +
          'Please check the BMS service status and try again.',
      );
    }

    if (!parsedBody) {
      throw new Error(
        'SQL API returned an empty or non-JSON response body.',
      );
    }

    return parsedBody;
  } catch (error: unknown) {
    let finalErr: Error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      finalErr = new Error('Query timed out after 60 seconds. Try a simpler query.', {
        cause: error,
      });
    } else if (
      error instanceof Error &&
      (error.message.startsWith('Session unauthorized') ||
        error.message.startsWith('Database error') ||
        error.message.startsWith('SQL API returned') ||
        error.message.startsWith('Query timed out') ||
        error.message.startsWith('SQL API returned an empty') ||
        error.message.startsWith('มีการร้องขอบ่อยเกินไป'))
    ) {
      finalErr = error;
    } else {
      finalErr = new Error(
        'Unable to connect to the BMS API. Please check your connection.',
        { cause: error },
      );
    }
    notifyApiFailure('SQL query', finalErr);
    throw finalErr;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Local API detection
// ---------------------------------------------------------------------------

/**
 * Probe the local HOSxP API gateway at 127.0.0.1:45011.
 *
 * Users typically run the API gateway on the same machine as the browser.
 * If the local endpoint responds successfully, we swap the remote tunnel URL
 * for the local one — this avoids the latency and bandwidth cost of tunnelling.
 *
 * @returns A new {@link ConnectionConfig} pointing to the local API if reachable,
 *          or the original config unchanged.
 */
export async function probeLocalApi(
  config: ConnectionConfig,
  marketplaceToken?: string,
): Promise<{ config: ConnectionConfig; isLocal: boolean }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LOCAL_PROBE_TIMEOUT_MS);

  try {
    const body: Record<string, string> = {
      sql: 'SELECT 1 as test',
      app: config.appIdentifier,
    };
    if (marketplaceToken) body['marketplace-token'] = marketplaceToken;

    const response = await fetch(withRandomParam(`${LOCAL_API_URL}/api/sql`), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.bearerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (response.ok) {
      const data = await response.json() as SqlApiResponse;
      if (data.MessageCode === 200) {
        console.info(`[BmsSession] Local API detected at ${LOCAL_API_URL} — using local endpoint`);
        return {
          config: { ...config, apiUrl: LOCAL_API_URL },
          isLocal: true,
        };
      }
    }
  } catch {
    // Network error, timeout, or CORS — local API not available
  } finally {
    clearTimeout(timeoutId);
  }

  console.info(`[BmsSession] Local API not available — using remote endpoint: ${config.apiUrl}`);
  return { config, isLocal: false };
}

// ---------------------------------------------------------------------------
// Database type detection
// ---------------------------------------------------------------------------

/**
 * Query the remote database for its version string and determine the
 * {@link DatabaseType}.
 *
 * Falls back to `'mysql'` when detection fails (e.g. network error or
 * unexpected response shape).
 */
export async function detectDatabaseType(
  config: ConnectionConfig,
  marketplaceToken?: string,
): Promise<DatabaseType> {
  try {
    const response = await executeSqlViaApiQueued(
      'SELECT VERSION() as version',
      config,
      undefined,
      marketplaceToken,
    );

    const versionRow = response.data?.[0];
    if (!versionRow) {
      return 'mysql';
    }

    const versionString = String(versionRow['version'] ?? versionRow['VERSION'] ?? '');
    if (!versionString) {
      return 'mysql';
    }

    return queryBuilder.detectDatabaseType(versionString);
  } catch {
    return 'mysql';
  }
}

// ---------------------------------------------------------------------------
// Queued SQL execution (with concurrency control)
// ---------------------------------------------------------------------------

/**
 * Generate a unique request ID for deduplication.
 *
 * Uses the normalized SQL + bound params + connection key directly as the ID
 * to avoid hash collisions that could cause one query to silently return
 * another's result. Params are included so that two queries with identical
 * SQL but different bindings are treated as distinct requests.
 */
function generateRequestId(
  sql: string,
  config: ConnectionConfig,
  params?: SqlParams,
  marketplaceToken?: string,
): string {
  const normalizedSql = sql.trim().replace(/\s+/g, ' ').toLowerCase();
  const paramsKey =
    params && Object.keys(params).length > 0
      ? JSON.stringify(
          Object.keys(params)
            .sort()
            .map((k) => [k, params[k]?.value_type, params[k]?.value]),
        )
      : '';
  const mktKey = marketplaceToken ? `:mkt:${marketplaceToken.slice(-8)}` : '';
  return `sql:${config.apiUrl}:${config.bearerToken.slice(-8)}:${normalizedSql}:${paramsKey}${mktKey}`;
}

/**
 * Execute SQL via API with queue management.
 *
 * This function wraps `executeSqlViaApi` with:
 * - Request deduplication (identical concurrent requests share the same result)
 * - Concurrency limiting (max 3 concurrent API calls)
 * - Automatic retry on HTTP 429 with exponential backoff
 *
 * Pass `params` to bind named placeholders (`:name`) safely on the server.
 *
 * @throws {Error} On network failure, HTTP errors, or timeout.
 */
export async function executeSqlViaApiQueued(
  sql: string,
  config: ConnectionConfig,
  params?: SqlParams,
  marketplaceToken?: string,
): Promise<SqlApiResponse> {
  const requestId = generateRequestId(sql, config, params, marketplaceToken);

  return apiQueue.enqueue(requestId, () =>
    executeSqlViaApi(sql, config, params, marketplaceToken),
  );
}

/**
 * Clear the API request queue.
 * Call this when disconnecting to cancel pending requests.
 */
export function clearApiQueue(): void {
  apiQueue.clear();
}

/**
 * Get current API queue statistics.
 */
export function getApiQueueStats() {
  return apiQueue.getStats();
}

// ---------------------------------------------------------------------------
// REST / Function shared helpers
// ---------------------------------------------------------------------------

/**
 * Extract the informative error text from a BMS response body.
 * BMS validation failures put a short label in `Message` and per-field reasons
 * in an `errors` array — flatten them so the user sees the full context.
 */
async function extractApiMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      Message?: unknown;
      message?: unknown;
      errors?: unknown;
      Errors?: unknown;
    };
    const head = body.Message ?? body.message;
    const errorsArr = body.errors ?? body.Errors;
    const errorList = Array.isArray(errorsArr)
      ? errorsArr.map((e) => String(e)).join('; ')
      : '';
    const headText =
      typeof head === 'string'
        ? head
        : head == null
          ? ''
          : JSON.stringify(head);
    if (headText && errorList) return `${headText}: ${errorList}`;
    if (errorList) return errorList;
    if (headText) return headText;
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

// ---------------------------------------------------------------------------
// REST API — /api/rest (CRUD on whitelisted tables)
// ---------------------------------------------------------------------------

/**
 * Insert a new record via the REST CRUD endpoint.
 *
 * `POST /api/rest/{tableName}`
 *
 * Requires a marketplace token with READWRITE grant for the target table.
 * Pass it explicitly or rely on the active-session singleton to supply it.
 *
 * @throws {Error} On HTTP error, network failure, or timeout.
 */
export async function restInsert(
  tableName: string,
  data: Record<string, unknown>,
  config: ConnectionConfig,
  marketplaceToken?: string,
): Promise<RestApiResponse> {
  const eff = resolveConfig(config);
  const effMkt = resolveMarketplaceToken(marketplaceToken);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);

  try {
    const url = withRandomParam(
      `${eff.apiUrl}/api/rest/${encodeURIComponent(tableName)}`,
    );
    const body = effMkt ? { 'marketplace-token': effMkt, ...data } : data;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${eff.bearerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const msg = await extractApiMessage(response);
      throw new Error(`REST POST ${tableName}: ${msg}`);
    }

    return (await response.json()) as RestApiResponse;
  } catch (error: unknown) {
    let finalErr: Error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      finalErr = new Error(
        `REST insert timed out after ${QUERY_TIMEOUT_MS / 1000}s`,
        { cause: error },
      );
    } else if (error instanceof Error && error.message.startsWith('REST')) {
      finalErr = error;
    } else {
      finalErr = new Error('Unable to connect to BMS REST API.', { cause: error });
    }
    notifyApiFailure(`REST POST ${tableName}`, finalErr);
    throw finalErr;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Update a record via the REST CRUD endpoint.
 *
 * `PUT /api/rest/{tableName}/{resourceId}`
 *
 * Requires a marketplace token with READWRITE grant for the target table.
 */
export async function restUpdate(
  tableName: string,
  resourceId: string | number,
  data: Record<string, unknown>,
  config: ConnectionConfig,
  marketplaceToken?: string,
): Promise<RestApiResponse> {
  const eff = resolveConfig(config);
  const effMkt = resolveMarketplaceToken(marketplaceToken);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);

  try {
    const url = withRandomParam(
      `${eff.apiUrl}/api/rest/${encodeURIComponent(tableName)}/${encodeURIComponent(String(resourceId))}`,
    );
    const body = effMkt ? { 'marketplace-token': effMkt, ...data } : data;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${eff.bearerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const msg = await extractApiMessage(response);
      throw new Error(`REST PUT ${tableName}/${resourceId}: ${msg}`);
    }

    return (await response.json()) as RestApiResponse;
  } catch (error: unknown) {
    let finalErr: Error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      finalErr = new Error(
        `REST update timed out after ${QUERY_TIMEOUT_MS / 1000}s`,
        { cause: error },
      );
    } else if (error instanceof Error && error.message.startsWith('REST')) {
      finalErr = error;
    } else {
      finalErr = new Error('Unable to connect to BMS REST API.', { cause: error });
    }
    notifyApiFailure(`REST PUT ${tableName}/${resourceId}`, finalErr);
    throw finalErr;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Delete a record via the REST CRUD endpoint.
 *
 * `DELETE /api/rest/{tableName}/{resourceId}?marketplace-token=…`
 *
 * The marketplace token is placed in the query string (DELETE requests have
 * no body). Requires a READWRITE grant for the target table.
 */
export async function restDelete(
  tableName: string,
  resourceId: string | number,
  config: ConnectionConfig,
  marketplaceToken?: string,
): Promise<RestApiResponse> {
  const eff = resolveConfig(config);
  const effMkt = resolveMarketplaceToken(marketplaceToken);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);

  try {
    let url = `${eff.apiUrl}/api/rest/${encodeURIComponent(tableName)}/${encodeURIComponent(String(resourceId))}`;
    if (effMkt) {
      url += `?marketplace-token=${encodeURIComponent(effMkt)}`;
    }
    url = withRandomParam(url);

    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${eff.bearerToken}`,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const msg = await extractApiMessage(response);
      throw new Error(`REST DELETE ${tableName}/${resourceId}: ${msg}`);
    }

    return (await response.json()) as RestApiResponse;
  } catch (error: unknown) {
    let finalErr: Error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      finalErr = new Error(
        `REST delete timed out after ${QUERY_TIMEOUT_MS / 1000}s`,
        { cause: error },
      );
    } else if (error instanceof Error && error.message.startsWith('REST')) {
      finalErr = error;
    } else {
      finalErr = new Error('Unable to connect to BMS REST API.', { cause: error });
    }
    notifyApiFailure(`REST DELETE ${tableName}/${resourceId}`, finalErr);
    throw finalErr;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Server function execution — /api/function?name=...
// ---------------------------------------------------------------------------

/**
 * Execute a built-in BMS server function and return the parsed response.
 *
 * Unlike `/api/sql`, `/api/function` invokes a named server-side function that
 * runs inside the BMS process (e.g. `get_hosvariable`, `get_serialnumber`).
 * Each function accepts its own JSON payload and may return its result under
 * a function-specific field (`Value` for scalars, `xmldata` for `get_cds_xml`,
 * etc.).
 *
 * @example
 *   await callBmsFunction('get_hosvariable', config, { variable_name: 'HOSPITAL_NAME' });
 *
 * @throws {Error} On network failure, HTTP errors, or timeout.
 */
export async function callBmsFunction(
  functionName: string,
  config: ConnectionConfig,
  payload: Record<string, unknown> = {},
): Promise<BmsFunctionResponse> {
  const eff = resolveConfig(config);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);

  try {
    const url = withRandomParam(
      `${eff.apiUrl}/api/function?name=${encodeURIComponent(functionName)}`,
    );
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${eff.bearerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (response.status === 429) {
      let retryInfo = '';
      const retryAfter = response.headers.get('Retry-After');
      if (retryAfter) {
        retryInfo = ` กรุณารอ ${retryAfter} วินาทีแล้วลองใหม่`;
      }
      try {
        const errorData = (await response.json()) as {
          message?: string;
          error?: string;
        };
        const detail = errorData.message || errorData.error;
        if (detail) retryInfo = `: ${detail}`;
      } catch {
        /* ignore */
      }
      throw new Error(
        `มีการร้องขอบ่อยเกินไป (HTTP 429).${retryInfo} กรุณารอสักครู่แล้วลองใหม่อีกครั้ง`,
      );
    }

    if (response.status === 501) {
      throw new Error(
        'Session unauthorized. Please reconnect with a valid session ID.',
      );
    }

    if (!response.ok) {
      const msg = await extractApiMessage(response);
      throw new Error(`Function API returned HTTP ${response.status}: ${msg}`);
    }

    const result = (await response.json()) as BmsFunctionResponse;
    // Some BMS functions return HTTP 200 but signal errors in the body
    // (e.g. "Invalid Key data for get_serialnumber table_name" at
    // MessageCode 500 — see /api/function error docs in BMS-SESSION-FOR-DEV).
    if (
      typeof result.MessageCode === 'number' &&
      result.MessageCode >= 400 &&
      result.Message
    ) {
      throw new Error(result.Message);
    }
    return result;
  } catch (error: unknown) {
    let finalErr: Error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      finalErr = new Error(
        `Function call timed out after ${QUERY_TIMEOUT_MS / 1000}s`,
        { cause: error },
      );
    } else if (error instanceof Error) {
      // Covers our own prefixed errors (Session unauthorized, Function API
      // returned, Function call timed out, rate-limit text, etc.) AND the
      // function-body errors thrown above as `new Error(result.Message)`.
      finalErr = error;
    } else {
      finalErr = new Error('Unable to connect to the BMS API.', { cause: error });
    }
    notifyApiFailure(`Function ${functionName}`, finalErr);
    throw finalErr;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Generate a unique integer primary key via the `get_serialnumber` function.
 *
 * The server runs `SELECT get_serialnumber(:serial)` and verifies the result
 * doesn't already exist in `{tableName}.{fieldName}` before returning it.
 * Call this immediately before INSERT — HOSxP tables don't use AUTO_INCREMENT.
 *
 * @example
 *   const id = await getSerialNumber(config, 'refill_order_id', 'refill_order', 'order_id')
 */
export async function getSerialNumber(
  config: ConnectionConfig,
  serialName: string,
  tableName: string,
  fieldName: string,
): Promise<number> {
  const response = await callBmsFunction('get_serialnumber', config, {
    serial_name: serialName,
    table_name: tableName,
    field_name: fieldName,
  });
  const value = response.Value;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(
      `get_serialnumber returned a non-numeric value: ${JSON.stringify(value)}`,
    );
  }
  return value;
}

/**
 * Read a hospital-wide configuration variable via `get_hosvariable`.
 *
 * Returns `sys_var.sys_value` for the given `variable_name`. Missing variables
 * are auto-created server-side with an empty value, so this never throws for
 * unknown names — it simply returns `''`.
 */
export async function getHosVariable(
  config: ConnectionConfig,
  variableName: string,
): Promise<string> {
  const response = await callBmsFunction('get_hosvariable', config, {
    variable_name: variableName,
  });
  return response.Value == null ? '' : String(response.Value);
}

/**
 * Update a `sys_var` row via `set_hosvariable`. Creates the variable when it
 * does not already exist. Requires the calling session to have operator/admin
 * rights — the server surfaces permission failures as `Database error:`.
 */
export async function setHosVariable(
  config: ConnectionConfig,
  variableName: string,
  variableValue: string,
): Promise<void> {
  await callBmsFunction('set_hosvariable', config, {
    variable_name: variableName,
    variable_value: variableValue,
  });
}

// ---------------------------------------------------------------------------
// Convenience wrappers for commonly-used utility functions
// ---------------------------------------------------------------------------

/** Fetch the server clock — useful for reconciling client-side drift. */
export async function getServerDateTime(config: ConnectionConfig): Promise<{
  serverDateTime: string;
  serverDate: string;
}> {
  const response = await callBmsFunction('get_server_datetime', config);
  return {
    serverDateTime: String(response.server_datetime ?? ''),
    serverDate: String(response.server_date ?? ''),
  };
}

/** Generate a new GUID on the server. */
export async function getNewGuid(config: ConnectionConfig): Promise<string> {
  const response = await callBmsFunction('get_newguid', config);
  return response.Value == null ? '' : String(response.Value);
}

/** Generate a new patient HN. */
export async function getNewHn(config: ConnectionConfig): Promise<string> {
  const response = await callBmsFunction('get_new_hn', config);
  return response.Value == null ? '' : String(response.Value);
}

/** Fetch hospital master data (code, name, address, tel). */
export async function getHospitalInfo(config: ConnectionConfig): Promise<{
  hospitalCode: string;
  hospitalName: string;
  hospitalNameEng: string;
  hospitalAddress: string;
  hospitalTel: string;
  hospitalProvince: string;
}> {
  const response = await callBmsFunction('get_hospital_info', config);
  return {
    hospitalCode: String(response.hospital_code ?? ''),
    hospitalName: String(response.hospital_name ?? ''),
    hospitalNameEng: String(response.hospital_name_eng ?? ''),
    hospitalAddress: String(response.hospital_address ?? ''),
    hospitalTel: String(response.hospital_tel ?? ''),
    hospitalProvince: String(response.hospital_province ?? ''),
  };
}

/** Retrieve a patient's demographic record by HN. */
export async function getPatientInfo(
  config: ConnectionConfig,
  hn: string,
): Promise<Record<string, unknown> | null> {
  const response = await callBmsFunction('get_patient_info', config, { hn });
  const data = response.data;
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
}

/** Retrieve a visit record by VN. */
export async function getPatientVisitInfo(
  config: ConnectionConfig,
  vn: string,
): Promise<Record<string, unknown> | null> {
  const response = await callBmsFunction('get_patient_visit_info', config, { vn });
  const data = response.data;
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
}

/** Compute patient age at today or at an optional reference date. */
export async function getPatientAge(
  config: ConnectionConfig,
  hn: string,
  refDate?: string,
): Promise<number> {
  const payload: Record<string, unknown> = { hn };
  if (refDate) payload.ref_date = refDate;
  const response = await callBmsFunction('get_patient_age', config, payload);
  const value = response.Value ?? response.age_year;
  return typeof value === 'number' ? value : Number(value ?? 0);
}

/** Boolean validators — thin wrappers that unwrap the `valid` field. */
export async function validateHn(config: ConnectionConfig, hn: string): Promise<boolean> {
  const r = await callBmsFunction('validate_hn', config, { hn });
  return Boolean(r.valid);
}
export async function validateVn(config: ConnectionConfig, vn: string): Promise<boolean> {
  const r = await callBmsFunction('validate_vn', config, { vn });
  return Boolean(r.valid);
}
export async function validateAn(config: ConnectionConfig, an: string): Promise<boolean> {
  const r = await callBmsFunction('validate_an', config, { an });
  return Boolean(r.valid);
}
export async function validateCid(config: ConnectionConfig, cid: string): Promise<boolean> {
  const r = await callBmsFunction('validate_cid', config, { cid });
  return Boolean(r.valid);
}

/** Look up an ICD-10 diagnosis name (English + Thai). */
export async function getIcd10Name(
  config: ConnectionConfig,
  icd10Code: string,
): Promise<{ name: string; thaiName: string }> {
  const r = await callBmsFunction('get_icd10_name', config, { icd10_code: icd10Code });
  return {
    name: String(r.name ?? ''),
    thaiName: String(r.thai_name ?? ''),
  };
}
