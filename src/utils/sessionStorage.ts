// =============================================================================
// BMS Session KPI Dashboard - Cookie & URL Parameter Utilities (T019)
// =============================================================================

/** Cookie name used to persist the BMS session identifier */
export const BMS_SESSION_COOKIE_NAME = 'bms-session-id';

/** Number of days before the session cookie expires */
export const COOKIE_EXPIRY_DAYS = 7;

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

/**
 * Stores the BMS session ID in a cookie with a 7-day expiry.
 *
 * @param sessionId - The session identifier to persist.
 */
export function setSessionCookie(sessionId: string): void {
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + COOKIE_EXPIRY_DAYS);

  document.cookie = [
    `${BMS_SESSION_COOKIE_NAME}=${encodeURIComponent(sessionId)}`,
    `expires=${expiryDate.toUTCString()}`,
    'path=/',
  ].join('; ');
}

/**
 * Reads the BMS session ID from cookies.
 *
 * @returns The session ID string, or `null` if not found.
 */
export function getSessionCookie(): string | null {
  const cookies = document.cookie.split('; ');

  for (const cookie of cookies) {
    const [name, ...valueParts] = cookie.split('=');
    if (name === BMS_SESSION_COOKIE_NAME) {
      const value = valueParts.join('=');
      return value ? decodeURIComponent(value) : null;
    }
  }

  return null;
}

/**
 * Removes the BMS session cookie by setting its expiry to the past.
 */
export function removeSessionCookie(): void {
  document.cookie = [
    `${BMS_SESSION_COOKIE_NAME}=`,
    'expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'path=/',
  ].join('; ');
}

// ---------------------------------------------------------------------------
// URL parameter helpers
// ---------------------------------------------------------------------------

/**
 * Reads the BMS session ID from the current URL's query parameters.
 *
 * @returns The session ID string, or `null` if the parameter is absent.
 */
export function getSessionFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get(BMS_SESSION_COOKIE_NAME);
}

/**
 * Removes the `bms-session-id` query parameter from the browser URL without
 * triggering a page reload (uses `history.replaceState`).
 */
export function removeSessionFromUrl(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete(BMS_SESSION_COOKIE_NAME);

  window.history.replaceState(window.history.state, '', url.toString());
}

// ---------------------------------------------------------------------------
// Environment variable source
// ---------------------------------------------------------------------------

/**
 * Read the build-time `BMS_SESSION_ID` env var (wired in `vite.config.ts` via
 * `define: { 'import.meta.env.BMS_SESSION_ID': ... }`). Used by the provider
 * as a middle-priority fallback between URL and cookie — handy for local dev
 * and dockerised test environments where the operator pre-sets a fixed
 * session id via `.env` or `docker run -e BMS_SESSION_ID=...`.
 *
 * Returns `null` when the variable is unset or empty after trimming so the
 * caller can cleanly decide whether to fall through to the cookie source.
 */
export function getSessionFromEnv(): string | null {
  const raw = (import.meta.env as { BMS_SESSION_ID?: unknown }).BMS_SESSION_ID;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed || null;
}

// ---------------------------------------------------------------------------
// Marketplace token persistence (localStorage)
// ---------------------------------------------------------------------------

/**
 * Key used for the marketplace token in localStorage. Intentionally
 * snake_case to match the original spec spelling; the URL extractor accepts
 * both snake and kebab forms.
 */
export const MARKETPLACE_TOKEN_KEY = 'marketplace_token';

/** Store the marketplace token in localStorage. */
export function setMarketplaceToken(token: string): void {
  localStorage.setItem(MARKETPLACE_TOKEN_KEY, token);
}

/** Read the marketplace token from localStorage. */
export function getMarketplaceToken(): string | null {
  return localStorage.getItem(MARKETPLACE_TOKEN_KEY);
}

/** Remove the marketplace token from localStorage. */
export function removeMarketplaceToken(): void {
  localStorage.removeItem(MARKETPLACE_TOKEN_KEY);
}

/**
 * Check the current URL for a `marketplace_token` or `marketplace-token` query
 * parameter, persist it to localStorage if present, and strip both spellings
 * from the URL without a reload.
 *
 * Both spellings are accepted because upstream launchers vary: some embed the
 * token as `marketplace_token=…` (snake_case, the original spec), others as
 * `marketplace-token=…` (kebab-case, matching HTTP header convention). The
 * underscore form wins when both are present.
 *
 * @returns The token from the URL (preferred) or localStorage, or `null` when
 *          neither exists.
 */
export function handleUrlMarketplaceToken(): string | null {
  const params = new URLSearchParams(window.location.search);
  const urlToken =
    params.get('marketplace_token') ?? params.get('marketplace-token');

  if (urlToken) {
    setMarketplaceToken(urlToken);
    const url = new URL(window.location.href);
    url.searchParams.delete('marketplace_token');
    url.searchParams.delete('marketplace-token');
    window.history.replaceState(window.history.state, '', url.toString());
    return urlToken;
  }

  return getMarketplaceToken();
}

// ---------------------------------------------------------------------------
// Combined handler
// ---------------------------------------------------------------------------

/**
 * End-to-end handler that:
 * 1. Checks for a session ID in the URL query string.
 * 2. If found, persists it as a cookie and removes it from the URL.
 * 3. Returns the session ID (from URL or existing cookie), or `null`.
 */
export function handleUrlSession(): string | null {
  const urlSessionId = getSessionFromUrl();

  if (urlSessionId) {
    setSessionCookie(urlSessionId);
    removeSessionFromUrl();
    return urlSessionId;
  }

  return getSessionCookie();
}
