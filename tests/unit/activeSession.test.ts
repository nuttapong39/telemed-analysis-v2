// =============================================================================
// activeSession singleton — unit tests
// =============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ConnectionConfig } from '@/types';
import {
  setActiveSession,
  clearActiveSession,
  getActiveSession,
  getActiveConfig,
  getActiveSessionId,
  getActiveMarketplaceToken,
  setActiveMarketplaceToken,
  resolveConfig,
  resolveMarketplaceToken,
  __resetActiveSessionForTests,
} from '@/services/activeSession';

function makeConfig(bearer = 'bearer-AAA', apiUrl = 'https://tunnel-1.example'): ConnectionConfig {
  return {
    apiUrl,
    bearerToken: bearer,
    databaseType: 'mysql',
    appIdentifier: 'TestApp',
  };
}

beforeEach(() => {
  __resetActiveSessionForTests();
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

describe('activeSession singleton', () => {
  describe('setActiveSession', () => {
    it('publishes the session, config, and marketplace token', () => {
      const cfg = makeConfig();
      setActiveSession('sess-1', cfg, 'mkt-XYZ');

      const snap = getActiveSession();
      expect(snap).not.toBeNull();
      expect(snap?.sessionId).toBe('sess-1');
      expect(snap?.config).toBe(cfg);
      expect(snap?.marketplaceToken).toBe('mkt-XYZ');
    });

    it('replaces the previous value atomically on every call', () => {
      setActiveSession('sess-1', makeConfig('bearer-AAA'), 'mkt-1');
      const first = getActiveConfig();

      setActiveSession('sess-2', makeConfig('bearer-BBB', 'https://tunnel-2.example'), 'mkt-2');
      const second = getActiveConfig();

      expect(first?.bearerToken).toBe('bearer-AAA');
      expect(second?.bearerToken).toBe('bearer-BBB');
      expect(getActiveSessionId()).toBe('sess-2');
      expect(getActiveMarketplaceToken()).toBe('mkt-2');
    });

    it('accepts an omitted marketplace token (undefined)', () => {
      setActiveSession('sess-1', makeConfig());
      expect(getActiveMarketplaceToken()).toBeUndefined();
    });
  });

  describe('clearActiveSession', () => {
    it('resets the singleton to null', () => {
      setActiveSession('sess-1', makeConfig(), 'mkt-1');
      clearActiveSession();
      expect(getActiveSession()).toBeNull();
      expect(getActiveConfig()).toBeNull();
      expect(getActiveSessionId()).toBeNull();
      expect(getActiveMarketplaceToken()).toBeUndefined();
    });
  });

  describe('setActiveMarketplaceToken', () => {
    it('updates only the token without touching sessionId or config', () => {
      const cfg = makeConfig();
      setActiveSession('sess-1', cfg, 'mkt-1');
      setActiveMarketplaceToken('mkt-2');

      expect(getActiveSessionId()).toBe('sess-1');
      expect(getActiveConfig()).toBe(cfg);
      expect(getActiveMarketplaceToken()).toBe('mkt-2');
    });

    it('can clear the token (undefined) without touching session or config', () => {
      const cfg = makeConfig();
      setActiveSession('sess-1', cfg, 'mkt-1');
      setActiveMarketplaceToken(undefined);

      expect(getActiveSessionId()).toBe('sess-1');
      expect(getActiveMarketplaceToken()).toBeUndefined();
    });

    it('is a no-op when there is no active session', () => {
      setActiveMarketplaceToken('mkt-1');
      expect(getActiveSession()).toBeNull();
    });

    it('short-circuits when the token is unchanged', () => {
      setActiveSession('sess-1', makeConfig(), 'mkt-1');
      const infoSpy = vi.spyOn(console, 'info');
      infoSpy.mockClear();
      setActiveMarketplaceToken('mkt-1');
      // setActiveSession already logged during beforeEach; same-value update should not log again.
      expect(infoSpy).not.toHaveBeenCalled();
    });
  });

  describe('resolveConfig', () => {
    it('returns the active config when set, ignoring the passed value', () => {
      const active = makeConfig('bearer-ACTIVE');
      const passed = makeConfig('bearer-PASSED');
      setActiveSession('sess-1', active);

      expect(resolveConfig(passed)).toBe(active);
    });

    it('falls back to the passed value when no active session is set', () => {
      const passed = makeConfig('bearer-PASSED');
      expect(resolveConfig(passed)).toBe(passed);
    });
  });

  describe('resolveMarketplaceToken', () => {
    it('returns the active token when an active session exists', () => {
      setActiveSession('sess-1', makeConfig(), 'mkt-ACTIVE');
      expect(resolveMarketplaceToken('mkt-PASSED')).toBe('mkt-ACTIVE');
    });

    it('falls back to the passed token when active session has no token', () => {
      setActiveSession('sess-1', makeConfig());
      expect(resolveMarketplaceToken('mkt-PASSED')).toBe('mkt-PASSED');
    });

    it('falls back to the passed token when there is no active session', () => {
      expect(resolveMarketplaceToken('mkt-PASSED')).toBe('mkt-PASSED');
    });

    it('returns undefined when neither active nor passed token exists', () => {
      expect(resolveMarketplaceToken()).toBeUndefined();
    });
  });
});
