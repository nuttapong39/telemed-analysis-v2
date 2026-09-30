import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from 'react'
import { useLocation } from 'react-router-dom'
import { useBmsSession } from '@/hooks/useBmsSession'
import { setActiveMarketplaceToken } from '@/services/activeSession'
import {
  handleUrlSession,
  getSessionCookie,
  getSessionFromEnv,
  handleUrlMarketplaceToken,
  getSessionFromUrl,
  getMarketplaceToken,
  removeMarketplaceToken,
} from '@/utils/sessionStorage'

type BmsSessionContextType = ReturnType<typeof useBmsSession> & {
  marketplaceToken: string | undefined
}

const BmsSessionContext = createContext<BmsSessionContextType | null>(null)

interface BmsSessionProviderProps {
  children: ReactNode
}

export function BmsSessionProvider({ children }: BmsSessionProviderProps) {
  const session = useBmsSession()
  const [marketplaceToken, setMarketplaceToken] = useState<string | undefined>(undefined)
  const location = useLocation()
  const lastSessionRef = useRef<string | null>(null)

  useEffect(() => {
    // --- Marketplace-token resolution ---
    // The token must be paired with the session that minted it. When a NEW
    // bms-session-id arrives in the URL without an accompanying marketplace
    // token, pairing the new session with the stale localStorage token makes
    // the BMS tunnel reject the combination (HTTP 501). So:
    //   - URL has marketplace token → use it (and persist to localStorage)
    //   - URL has new bms-session-id but no marketplace token → clear the
    //     stale token; the new session stands on its own
    //   - Otherwise → fall back to localStorage (cookie-based reconnect)
    const urlSessionId = getSessionFromUrl()
    const urlParams = new URLSearchParams(window.location.search)
    // Accept both snake_case (`marketplace_token`) and kebab-case
    // (`marketplace-token`) because upstream launchers use different
    // conventions; kept in sync with handleUrlMarketplaceToken().
    const urlTokenPresent =
      urlParams.has('marketplace_token') || urlParams.has('marketplace-token')

    let token: string | null = null
    if (urlTokenPresent) {
      token = handleUrlMarketplaceToken() // reads URL, stores, strips from URL
    } else if (urlSessionId && urlSessionId !== lastSessionRef.current) {
      // New session without a paired token — drop the old one.
      removeMarketplaceToken()
      token = null
    } else {
      token = getMarketplaceToken()
    }

    setMarketplaceToken(token ?? undefined)
    // Keep the active-session singleton in sync with the React token state.
    // When only the marketplace token changes in the URL (session ID is the
    // same), connectSession won't re-run, so without this explicit push the
    // singleton keeps serving the stale token through resolveMarketplaceToken()
    // — which will shadow the fresh value callers pass to /api/sql and /api/rest.
    setActiveMarketplaceToken(token ?? undefined)

    // --- Session resolution ---
    if (urlSessionId && urlSessionId !== lastSessionRef.current) {
      lastSessionRef.current = urlSessionId
      const resolved = handleUrlSession() // stores cookie + removes from URL
      if (resolved) {
        session.connectSession(resolved, token ?? undefined)
      }
      return
    }

    if (!lastSessionRef.current) {
      // Priority: cookie (persisted from a previous visit) → env var
      // (BMS_SESSION_ID, for dev/test auto-onboard). URL is handled above and
      // always wins when present.
      const cookieSessionId = getSessionCookie()
      if (cookieSessionId) {
        lastSessionRef.current = cookieSessionId
        session.connectSession(cookieSessionId, token ?? undefined)
        return
      }

      const envSessionId = getSessionFromEnv()
      if (envSessionId) {
        lastSessionRef.current = envSessionId
        // Persist the env-derived id as a cookie so later refreshes don't
        // re-read the env var (which might have been removed) and the user's
        // session survives the usual cookie-based reconnect path.
        session.connectSession(envSessionId, token ?? undefined)
      }
    }
  }, [location.search]) // eslint-disable-line react-hooks/exhaustive-deps

  const value: BmsSessionContextType = { ...session, marketplaceToken }

  return (
    <BmsSessionContext.Provider value={value}>
      {children}
    </BmsSessionContext.Provider>
  )
}

export function useBmsSessionContext(): BmsSessionContextType {
  const context = useContext(BmsSessionContext)
  if (!context) {
    throw new Error('useBmsSessionContext must be used within a BmsSessionProvider')
  }
  return context
}
