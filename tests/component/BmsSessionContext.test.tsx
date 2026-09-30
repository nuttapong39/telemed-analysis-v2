// =============================================================================
// BmsSessionContext — URL extraction, stale-token drop, cookie fallback
// =============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import {
  BmsSessionProvider,
  useBmsSessionContext,
} from '@/contexts/BmsSessionContext'
import {
  setMarketplaceToken,
  getMarketplaceToken,
  MARKETPLACE_TOKEN_KEY,
  BMS_SESSION_COOKIE_NAME,
} from '@/utils/sessionStorage'
import { __resetActiveSessionForTests } from '@/services/activeSession'

// ---------------------------------------------------------------------------
// DOM mocks
// ---------------------------------------------------------------------------

function installLocationMock(url: string) {
  const parsed = new URL(url)
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      href: parsed.href,
      search: parsed.search,
      origin: parsed.origin,
      pathname: parsed.pathname,
      hash: parsed.hash,
    },
  })
  Object.defineProperty(window, 'history', {
    configurable: true,
    value: {
      ...window.history,
      replaceState: vi.fn(),
      state: null,
    },
  })
}

function installCookieMock() {
  let store = ''
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: () => store,
    set: (value: string) => {
      const name = value.split('=')[0]
      const kept = store
        .split('; ')
        .filter((c) => c && !c.startsWith(`${name}=`))
      if (value.includes('1970')) {
        store = kept.join('; ')
      } else {
        kept.push(value.split(';')[0])
        store = kept.join('; ')
      }
    },
  })
  return {
    setRaw: (raw: string) => {
      store = raw
    },
    getRaw: () => store,
  }
}

// ---------------------------------------------------------------------------
// Provider harness
// ---------------------------------------------------------------------------

function Inspector() {
  const ctx = useBmsSessionContext()
  return (
    <div>
      <span data-testid="mkt">{ctx.marketplaceToken ?? ''}</span>
      <span data-testid="state">{ctx.sessionState}</span>
    </div>
  )
}

function renderProvider() {
  return render(
    <MemoryRouter>
      <BmsSessionProvider>
        <Inspector />
      </BmsSessionProvider>
    </MemoryRouter>,
  )
}

// ---------------------------------------------------------------------------
// Fetch mock — returns a non-200 MessageCode so connectSession fails fast,
// letting us inspect the provider's token handling without a full handshake.
// ---------------------------------------------------------------------------

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  __resetActiveSessionForTests()
  localStorage.clear()
  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        MessageCode: 500,
        Message: 'expired in fixture',
        RequestTime: '',
        result: {},
      }),
  })
  globalThis.fetch = fetchMock as unknown as typeof fetch
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BmsSessionContext — URL extraction', () => {
  it('extracts `marketplace_token` (snake_case) from URL and exposes via context', async () => {
    installCookieMock()
    installLocationMock(
      'https://app.example/?bms-session-id=sess-1&marketplace_token=mkt-URL',
    )

    renderProvider()

    await waitFor(() => {
      expect(screen.getByTestId('mkt').textContent).toBe('mkt-URL')
    })
    expect(localStorage.getItem(MARKETPLACE_TOKEN_KEY)).toBe('mkt-URL')
  })

  it('extracts `marketplace-token` (kebab-case) from URL and exposes via context', async () => {
    installCookieMock()
    installLocationMock(
      'https://app.example/?bms-session-id=sess-1&marketplace-token=mkt-KEBAB',
    )

    renderProvider()

    await waitFor(() => {
      expect(screen.getByTestId('mkt').textContent).toBe('mkt-KEBAB')
    })
  })

  it('calls retrieveBmsSession with the session id extracted from URL', async () => {
    installCookieMock()
    installLocationMock('https://app.example/?bms-session-id=sess-ABC')

    renderProvider()

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })
    const [calledUrl] = fetchMock.mock.calls[0]
    expect(String(calledUrl)).toContain('code=sess-ABC')
  })
})

describe('BmsSessionContext — stale-token handling', () => {
  it('drops a stale localStorage token when a NEW session id arrives without a paired URL token', async () => {
    installCookieMock()
    setMarketplaceToken('mkt-STALE')
    installLocationMock('https://app.example/?bms-session-id=sess-NEW')

    renderProvider()

    await waitFor(() => {
      expect(screen.getByTestId('mkt').textContent).toBe('')
    })
    expect(getMarketplaceToken()).toBeNull()
  })

  it('preserves the localStorage token when reconnecting from cookie with no URL params', async () => {
    const cookie = installCookieMock()
    cookie.setRaw(`${BMS_SESSION_COOKIE_NAME}=sess-COOKIE`)
    setMarketplaceToken('mkt-KEEP')
    installLocationMock('https://app.example/')

    renderProvider()

    await waitFor(() => {
      expect(screen.getByTestId('mkt').textContent).toBe('mkt-KEEP')
    })
    expect(getMarketplaceToken()).toBe('mkt-KEEP')
  })
})

describe('BmsSessionContext — cookie fallback', () => {
  it('triggers connectSession with the cookie session id when no URL param exists', async () => {
    const cookie = installCookieMock()
    cookie.setRaw(`${BMS_SESSION_COOKIE_NAME}=sess-FROM-COOKIE`)
    installLocationMock('https://app.example/')

    renderProvider()

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })
    const [calledUrl] = fetchMock.mock.calls[0]
    expect(String(calledUrl)).toContain('code=sess-FROM-COOKIE')
  })

  it('does NOT call retrieveBmsSession when no URL param, no cookie, and no env var', async () => {
    installCookieMock()
    installLocationMock('https://app.example/')
    vi.stubEnv('BMS_SESSION_ID', '')

    renderProvider()

    // Give the effect a chance to run
    await new Promise((r) => setTimeout(r, 50))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByTestId('mkt').textContent).toBe('')
  })
})

describe('BmsSessionContext — env var fallback (BMS_SESSION_ID)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('auto-onboards from BMS_SESSION_ID env var when no URL and no cookie', async () => {
    installCookieMock()
    installLocationMock('https://app.example/')
    vi.stubEnv('BMS_SESSION_ID', 'sess-FROM-ENV')

    renderProvider()

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })
    const [calledUrl] = fetchMock.mock.calls[0]
    expect(String(calledUrl)).toContain('code=sess-FROM-ENV')
  })

  it('trims whitespace in the env var before using it', async () => {
    installCookieMock()
    installLocationMock('https://app.example/')
    vi.stubEnv('BMS_SESSION_ID', '  sess-TRIMMED  ')

    renderProvider()

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })
    const [calledUrl] = fetchMock.mock.calls[0]
    expect(String(calledUrl)).toContain('code=sess-TRIMMED')
    expect(String(calledUrl)).not.toContain('%20sess')
  })

  it('treats an all-whitespace env var as empty (falls through to login)', async () => {
    installCookieMock()
    installLocationMock('https://app.example/')
    vi.stubEnv('BMS_SESSION_ID', '   ')

    renderProvider()

    await new Promise((r) => setTimeout(r, 50))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('URL param still wins over the env var', async () => {
    installCookieMock()
    installLocationMock('https://app.example/?bms-session-id=sess-URL')
    vi.stubEnv('BMS_SESSION_ID', 'sess-ENV')

    renderProvider()

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })
    const [calledUrl] = fetchMock.mock.calls[0]
    expect(String(calledUrl)).toContain('code=sess-URL')
    expect(String(calledUrl)).not.toContain('sess-ENV')
  })

  it('cookie still wins over the env var (priority: URL > cookie > env)', async () => {
    const cookie = installCookieMock()
    cookie.setRaw(`${BMS_SESSION_COOKIE_NAME}=sess-COOKIE`)
    installLocationMock('https://app.example/')
    vi.stubEnv('BMS_SESSION_ID', 'sess-ENV')

    renderProvider()

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })
    const [calledUrl] = fetchMock.mock.calls[0]
    expect(String(calledUrl)).toContain('code=sess-COOKIE')
    expect(String(calledUrl)).not.toContain('sess-ENV')
  })
})
