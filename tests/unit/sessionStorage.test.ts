// =============================================================================
// T012 - Session Storage Utility Tests
// Tests cookie management and URL parameter handling
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  setSessionCookie,
  getSessionCookie,
  removeSessionCookie,
  getSessionFromUrl,
  removeSessionFromUrl,
  handleUrlSession,
  BMS_SESSION_COOKIE_NAME,
  COOKIE_EXPIRY_DAYS,
  setMarketplaceToken,
  getMarketplaceToken,
  removeMarketplaceToken,
  handleUrlMarketplaceToken,
  MARKETPLACE_TOKEN_KEY,
} from '@/utils/sessionStorage';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Set up a mock for document.cookie that tracks assignments */
function setupCookieMock() {
  let cookieStore = '';

  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: () => cookieStore,
    set: (value: string) => {
      // Simple simulation: store the latest assignment for testing
      // For multiple cookies, track them in a map
      const name = value.split('=')[0];
      const pairs = cookieStore.split('; ').filter((c) => c && !c.startsWith(`${name}=`));

      // If the cookie has an expired date, remove it; otherwise add it
      if (value.includes('1970')) {
        cookieStore = pairs.join('; ');
      } else {
        pairs.push(value.split(';')[0]); // Store only name=value
        cookieStore = pairs.join('; ');
      }
    },
  });

  return {
    reset: () => {
      cookieStore = '';
    },
    getRaw: () => cookieStore,
  };
}

/** Set up window.location and window.history mocks */
function setupLocationMock(url: string) {
  const urlObj = new URL(url);

  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      href: urlObj.href,
      search: urlObj.search,
      origin: urlObj.origin,
      pathname: urlObj.pathname,
      hash: urlObj.hash,
    },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sessionStorage - Cookie helpers', () => {
  let cookieMock: ReturnType<typeof setupCookieMock>;

  beforeEach(() => {
    cookieMock = setupCookieMock();
  });

  afterEach(() => {
    cookieMock.reset();
  });

  // -------------------------------------------------------------------------
  // setSessionCookie
  // -------------------------------------------------------------------------

  describe('setSessionCookie', () => {
    it('sets a cookie with the correct name and value', () => {
      setSessionCookie('test-session-123');

      const raw = cookieMock.getRaw();
      expect(raw).toContain(`${BMS_SESSION_COOKIE_NAME}=test-session-123`);
    });

    it('URL-encodes special characters in the session ID', () => {
      setSessionCookie('session with spaces & symbols=');

      const raw = cookieMock.getRaw();
      expect(raw).toContain(BMS_SESSION_COOKIE_NAME);
      expect(raw).toContain(encodeURIComponent('session with spaces & symbols='));
    });

    it('overwrites a previously set session cookie', () => {
      setSessionCookie('first-session');
      setSessionCookie('second-session');

      const raw = cookieMock.getRaw();
      expect(raw).toContain('second-session');
      expect(raw).not.toContain('first-session');
    });
  });

  // -------------------------------------------------------------------------
  // getSessionCookie
  // -------------------------------------------------------------------------

  describe('getSessionCookie', () => {
    it('returns the stored session ID value', () => {
      setSessionCookie('my-session-id');
      const result = getSessionCookie();
      expect(result).toBe('my-session-id');
    });

    it('returns null when no session cookie is set', () => {
      const result = getSessionCookie();
      expect(result).toBeNull();
    });

    it('decodes URL-encoded session IDs', () => {
      setSessionCookie('session%20test');
      const result = getSessionCookie();
      expect(result).toBe('session%20test');
    });

    it('returns null when cookie store is empty', () => {
      cookieMock.reset();
      const result = getSessionCookie();
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // removeSessionCookie
  // -------------------------------------------------------------------------

  describe('removeSessionCookie', () => {
    it('clears the session cookie', () => {
      setSessionCookie('session-to-remove');
      expect(getSessionCookie()).toBe('session-to-remove');

      removeSessionCookie();
      expect(getSessionCookie()).toBeNull();
    });

    it('does not throw when no cookie exists', () => {
      expect(() => removeSessionCookie()).not.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// URL parameter helpers
// ---------------------------------------------------------------------------

describe('sessionStorage - URL parameter helpers', () => {
  const replaceStateSpy = vi.fn();

  beforeEach(() => {
    Object.defineProperty(window, 'history', {
      configurable: true,
      value: {
        state: null,
        replaceState: replaceStateSpy,
      },
    });
    replaceStateSpy.mockClear();
  });

  // -------------------------------------------------------------------------
  // getSessionFromUrl
  // -------------------------------------------------------------------------

  describe('getSessionFromUrl', () => {
    it('extracts bms-session-id from URL query parameters', () => {
      setupLocationMock('https://example.com/?bms-session-id=url-session-123');
      const result = getSessionFromUrl();
      expect(result).toBe('url-session-123');
    });

    it('returns null when the parameter is not present', () => {
      setupLocationMock('https://example.com/?other=value');
      const result = getSessionFromUrl();
      expect(result).toBeNull();
    });

    it('returns null when there are no query parameters', () => {
      setupLocationMock('https://example.com/');
      const result = getSessionFromUrl();
      expect(result).toBeNull();
    });

    it('handles URL-encoded session IDs', () => {
      setupLocationMock('https://example.com/?bms-session-id=session%20with%20spaces');
      const result = getSessionFromUrl();
      expect(result).toBe('session with spaces');
    });
  });

  // -------------------------------------------------------------------------
  // removeSessionFromUrl
  // -------------------------------------------------------------------------

  describe('removeSessionFromUrl', () => {
    it('removes the bms-session-id parameter using history.replaceState', () => {
      setupLocationMock('https://example.com/?bms-session-id=remove-me&other=keep');
      removeSessionFromUrl();

      expect(replaceStateSpy).toHaveBeenCalledTimes(1);
      const newUrl = replaceStateSpy.mock.calls[0][2] as string;
      expect(newUrl).not.toContain('bms-session-id');
      expect(newUrl).toContain('other=keep');
    });

    it('cleans up the URL completely when session-id is the only parameter', () => {
      setupLocationMock('https://example.com/?bms-session-id=only-param');
      removeSessionFromUrl();

      expect(replaceStateSpy).toHaveBeenCalledTimes(1);
      const newUrl = replaceStateSpy.mock.calls[0][2] as string;
      expect(newUrl).not.toContain('bms-session-id');
      expect(newUrl).not.toContain('?');
    });
  });
});

// ---------------------------------------------------------------------------
// handleUrlSession (combined handler)
// ---------------------------------------------------------------------------

describe('sessionStorage - handleUrlSession', () => {
  let cookieMock: ReturnType<typeof setupCookieMock>;
  const replaceStateSpy = vi.fn();

  beforeEach(() => {
    cookieMock = setupCookieMock();
    Object.defineProperty(window, 'history', {
      configurable: true,
      value: {
        state: null,
        replaceState: replaceStateSpy,
      },
    });
    replaceStateSpy.mockClear();
  });

  afterEach(() => {
    cookieMock.reset();
  });

  it('extracts session from URL, stores cookie, and cleans URL', () => {
    setupLocationMock('https://example.com/?bms-session-id=url-session-456');

    const result = handleUrlSession();

    expect(result).toBe('url-session-456');
    // Cookie should be set
    expect(getSessionCookie()).toBe('url-session-456');
    // URL should be cleaned
    expect(replaceStateSpy).toHaveBeenCalledTimes(1);
  });

  it('returns existing cookie value when no URL parameter is present', () => {
    setupLocationMock('https://example.com/');
    setSessionCookie('existing-cookie-session');

    const result = handleUrlSession();

    expect(result).toBe('existing-cookie-session');
    expect(replaceStateSpy).not.toHaveBeenCalled();
  });

  it('returns null when no URL parameter and no cookie exist', () => {
    setupLocationMock('https://example.com/');

    const result = handleUrlSession();

    expect(result).toBeNull();
    expect(replaceStateSpy).not.toHaveBeenCalled();
  });

  it('URL parameter takes precedence over existing cookie', () => {
    setupLocationMock('https://example.com/?bms-session-id=new-from-url');
    setSessionCookie('old-cookie-value');

    const result = handleUrlSession();

    expect(result).toBe('new-from-url');
    expect(getSessionCookie()).toBe('new-from-url');
  });
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('sessionStorage - Constants', () => {
  it('BMS_SESSION_COOKIE_NAME is "bms-session-id"', () => {
    expect(BMS_SESSION_COOKIE_NAME).toBe('bms-session-id');
  });

  it('COOKIE_EXPIRY_DAYS is 7', () => {
    expect(COOKIE_EXPIRY_DAYS).toBe(7);
  });

  it('MARKETPLACE_TOKEN_KEY is "marketplace_token"', () => {
    expect(MARKETPLACE_TOKEN_KEY).toBe('marketplace_token');
  });
});

// ---------------------------------------------------------------------------
// Marketplace token helpers
// ---------------------------------------------------------------------------

describe('sessionStorage - Marketplace token helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('setMarketplaceToken / getMarketplaceToken / removeMarketplaceToken', () => {
    it('stores and reads the token from localStorage', () => {
      setMarketplaceToken('mkt-ABC');
      expect(getMarketplaceToken()).toBe('mkt-ABC');
      expect(localStorage.getItem(MARKETPLACE_TOKEN_KEY)).toBe('mkt-ABC');
    });

    it('returns null when the token is not set', () => {
      expect(getMarketplaceToken()).toBeNull();
    });

    it('removes the token', () => {
      setMarketplaceToken('mkt-XYZ');
      removeMarketplaceToken();
      expect(getMarketplaceToken()).toBeNull();
    });
  });

  describe('handleUrlMarketplaceToken', () => {
    it('extracts `marketplace_token` (snake_case) from URL, persists it, strips from URL', () => {
      setupLocationMock(
        'https://app.example/?bms-session-id=sess-1&marketplace_token=mkt-URL',
      );

      const result = handleUrlMarketplaceToken();

      expect(result).toBe('mkt-URL');
      expect(getMarketplaceToken()).toBe('mkt-URL');
    });

    it('extracts `marketplace-token` (kebab-case) from URL', () => {
      setupLocationMock(
        'https://app.example/?bms-session-id=sess-1&marketplace-token=mkt-KEBAB',
      );

      const result = handleUrlMarketplaceToken();

      expect(result).toBe('mkt-KEBAB');
    });

    it('prefers snake_case when both spellings are present', () => {
      setupLocationMock(
        'https://app.example/?marketplace_token=snake&marketplace-token=kebab',
      );

      const result = handleUrlMarketplaceToken();

      expect(result).toBe('snake');
    });

    it('falls back to localStorage when no URL param is present', () => {
      setupLocationMock('https://app.example/');
      setMarketplaceToken('mkt-STORED');

      const result = handleUrlMarketplaceToken();

      expect(result).toBe('mkt-STORED');
    });

    it('returns null when neither URL nor localStorage has a token', () => {
      setupLocationMock('https://app.example/');

      const result = handleUrlMarketplaceToken();

      expect(result).toBeNull();
    });
  });
});
