// =============================================================================
// Active BMS Session — single source of truth for the current session.
//
// React state propagation is not atomic: a polling interval set up before a
// reconnect still holds the OLD `connectionConfig` in its closure, and will
// fire /api/sql with the expired bearer token on its next tick. This module
// fixes that by keeping the latest config/session in a module-level singleton
// that low-level API functions read at call time — stale closures auto-heal.
//
// Lifecycle:
//   - connectSession() → setActiveSession(id, config, mkt) on success.
//   - Any state mutation (reconnect, disconnect) goes through set/clear here
//     so every downstream API call sees the same current value.
// =============================================================================

import type { ConnectionConfig } from '@/types';

interface ActiveSession {
  sessionId: string;
  config: ConnectionConfig;
  marketplaceToken?: string;
}

let current: ActiveSession | null = null;

/**
 * Publish the active session. Called from useBmsSession.connectSession after
 * the BMS handshake resolves. Safe to call multiple times during a single
 * connect (e.g. after probeLocalApi changes the apiUrl, after detectDatabaseType
 * sets the dbType) — each call atomically replaces the previous value.
 */
export function setActiveSession(
  sessionId: string,
  config: ConnectionConfig,
  marketplaceToken?: string,
): void {
  const prev = current?.config.bearerToken.slice(-8);
  current = { sessionId, config, marketplaceToken };
  console.info('[activeSession] setActiveSession', {
    sessionId: sessionId.slice(0, 8),
    prevBearer: prev,
    newBearer: config.bearerToken.slice(-8),
    apiUrl: config.apiUrl,
  });
}

/**
 * Clear the active session. Called on disconnect or when a connect attempt
 * fails. After clearing, low-level API functions fall back to the config
 * passed in by the caller — which is only valid for the initial connect flow.
 */
export function clearActiveSession(): void {
  const prev = current?.config.bearerToken.slice(-8);
  current = null;
  console.info('[activeSession] clearActiveSession', { prevBearer: prev });
}

export function getActiveSession(): ActiveSession | null {
  return current;
}

export function getActiveConfig(): ConnectionConfig | null {
  return current?.config ?? null;
}

export function getActiveSessionId(): string | null {
  return current?.sessionId ?? null;
}

export function getActiveMarketplaceToken(): string | undefined {
  return current?.marketplaceToken;
}

/**
 * Update just the marketplace-token on the active session, preserving
 * sessionId and config. Used when the token is refreshed via URL param or
 * localStorage without reconnecting the session — otherwise the singleton
 * would keep serving the stale token through resolveMarketplaceToken(),
 * overriding the fresh value React state passes to API callers. No-op when
 * there is no active session (the next connect will publish the token).
 */
export function setActiveMarketplaceToken(
  marketplaceToken: string | undefined,
): void {
  if (!current) return;
  if (current.marketplaceToken === marketplaceToken) return;
  const prev = current.marketplaceToken?.slice(-8) ?? 'none';
  const next = marketplaceToken?.slice(-8) ?? 'none';
  current = { ...current, marketplaceToken };
  console.info('[activeSession] setActiveMarketplaceToken', { prev, next });
}

/**
 * Resolve the effective config for an API call. Prefers the active session
 * (so closures that captured an older config auto-heal after a reconnect).
 * Falls back to the caller-provided config only when no active session is
 * set — which only happens during the initial connect flow before
 * setActiveSession runs.
 */
export function resolveConfig(passed: ConnectionConfig): ConnectionConfig {
  return current?.config ?? passed;
}

/**
 * Resolve the effective marketplace-token for an API call. Same fallback
 * logic as resolveConfig: active session wins when set, caller argument is
 * the fallback during the initial connect flow.
 */
export function resolveMarketplaceToken(
  passed?: string,
): string | undefined {
  if (current) return current.marketplaceToken ?? passed;
  return passed;
}

/**
 * Test helper — reset the singleton to its initial state. Not intended for
 * production code; tests use this between cases to avoid cross-test leakage.
 */
export function __resetActiveSessionForTests(): void {
  current = null;
}
