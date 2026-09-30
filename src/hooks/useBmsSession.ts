import { useState, useCallback } from 'react'
import type {
  Session,
  SessionState,
  DatabaseType,
  ConnectionConfig,
  SqlApiResponse,
} from '@/types'
import {
  retrieveBmsSession,
  extractConnectionConfig,
  extractUserInfo,
  extractSystemInfo,
  executeSqlViaApiQueued,
  clearApiQueue,
  detectDatabaseType,
  probeLocalApi,
} from '@/services/bmsSession'
import { apiQueue } from '@/services/apiQueue'
import {
  setActiveSession,
  clearActiveSession,
} from '@/services/activeSession'
import {
  setSessionCookie,
  removeSessionCookie,
} from '@/utils/sessionStorage'

interface UseBmsSessionResult {
  session: Session | null
  sessionState: SessionState
  connectionConfig: ConnectionConfig | null
  error: Error | null
  connectSession: (sessionId: string, marketplaceToken?: string) => Promise<boolean>
  disconnectSession: () => void
  setDisconnected: () => void
  refreshSession: () => Promise<boolean>
  executeQuery: (sql: string) => Promise<SqlApiResponse>
}

export function useBmsSession(): UseBmsSessionResult {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionState, setSessionState] = useState<SessionState>('idle')
  const [connectionConfig, setConnectionConfig] = useState<ConnectionConfig | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [lastSessionId, setLastSessionId] = useState<string | null>(null)
  const [lastMarketplaceToken, setLastMarketplaceToken] = useState<string | undefined>(undefined)

  const connectSession = useCallback(async (
    sessionId: string,
    marketplaceToken?: string,
  ): Promise<boolean> => {
    // Cancel in-flight queued requests tied to the previous session. Do NOT
    // clear the active-session singleton yet — that would create a window
    // where stale closures fall back to their captured (OLD) config via
    // resolveConfig(). Leave the singleton untouched until we can atomically
    // swap it to the new config below.
    clearApiQueue()
    setSession(null)
    setConnectionConfig(null)
    setSessionState('connecting')
    setError(null)
    setLastSessionId(sessionId)
    setLastMarketplaceToken(marketplaceToken)

    try {
      const response = await retrieveBmsSession(sessionId)

      if (response.MessageCode !== 200) {
        throw new Error(
          response.MessageCode === 500
            ? 'Session has expired. Please enter a new session ID.'
            : `Session retrieval failed: ${response.Message || 'Unknown error'}`,
        )
      }

      const remoteConfig = extractConnectionConfig(response)
      const userInfo = extractUserInfo(response)
      const systemInfo = extractSystemInfo(response)

      // Publish the fresh config to the active-session singleton so stale
      // closures auto-heal and subsequent reconnect-internal calls resolve
      // to this config.
      setActiveSession(sessionId, remoteConfig, marketplaceToken)

      // Probe local API gateway — use it if available, fall back to remote tunnel
      const { config: localOrRemoteConfig, isLocal } = await probeLocalApi(
        remoteConfig,
        marketplaceToken,
      )

      // Local API has no rate-limit / concurrency race, so we can parallelise.
      // Remote tunnel serialises per session — keep it at 1 concurrent request.
      apiQueue.setMaxConcurrent(isLocal ? 5 : 1)

      // Re-publish in case the probe promoted the URL to the local endpoint.
      setActiveSession(sessionId, localOrRemoteConfig, marketplaceToken)

      const dbType: DatabaseType = await detectDatabaseType(
        localOrRemoteConfig,
        marketplaceToken,
      )
      const updatedConfig: ConnectionConfig = {
        ...localOrRemoteConfig,
        databaseType: dbType,
      }

      const newSession: Session = {
        sessionId,
        apiUrl: updatedConfig.apiUrl,
        bearerToken: updatedConfig.bearerToken,
        databaseType: dbType,
        databaseName: response.result?.user_info?.bms_database_name ?? '',
        expirySeconds: response.result?.expired_second ?? 36000,
        connectedAt: new Date(),
        userInfo,
        systemInfo,
        isLocalApi: isLocal,
      }

      setActiveSession(sessionId, updatedConfig, marketplaceToken)
      setSession(newSession)
      setConnectionConfig(updatedConfig)
      setSessionState('connected')
      setSessionCookie(sessionId)

      return true
    } catch (err) {
      const sessionError = err instanceof Error ? err : new Error(String(err))
      clearActiveSession()
      setError(sessionError)
      setSessionState('disconnected')
      return false
    }
  }, [])

  const disconnectSession = useCallback(() => {
    clearApiQueue()
    clearActiveSession()
    setSession(null)
    setConnectionConfig(null)
    setSessionState('disconnected')
    setError(null)
    removeSessionCookie()
  }, [])

  const refreshSession = useCallback(async (): Promise<boolean> => {
    if (!lastSessionId) return false
    return connectSession(lastSessionId, lastMarketplaceToken)
  }, [lastSessionId, lastMarketplaceToken, connectSession])

  const executeQuery = useCallback(async (sql: string): Promise<SqlApiResponse> => {
    if (!connectionConfig) {
      throw new Error('Not connected. Please connect with a valid session ID first.')
    }

    try {
      return await executeSqlViaApiQueued(sql, connectionConfig)
    } catch (err) {
      // executeSqlViaApi throws on auth/expiry errors. Detect the two variants
      // the server produces: "Session unauthorized" (HTTP 501 or MessageCode 401)
      // and "Database error: ...Session expired..." (MessageCode 500 body).
      if (
        err instanceof Error &&
        (err.message.includes('unauthorized') ||
          /session\s+expired/i.test(err.message))
      ) {
        setSessionState('expired')
        setError(new Error('Session has expired. Please reconnect.'))
      }
      throw err
    }
  }, [connectionConfig])

  const setDisconnected = useCallback(() => {
    setSessionState('disconnected')
  }, [])

  return {
    session,
    sessionState,
    connectionConfig,
    error,
    connectSession,
    disconnectSession,
    setDisconnected,
    refreshSession,
    executeQuery,
  }
}
