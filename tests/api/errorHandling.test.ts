// =============================================================================
// T017 - API Contract Tests: Error Handling
// Tests error scenarios for BMS session retrieval and SQL execution using
// MSW v2 to intercept HTTP requests at the network level.
// =============================================================================

import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest'

import {
  retrieveBmsSession,
  executeSqlViaApi,
  SESSION_TIMEOUT_MS,
  QUERY_TIMEOUT_MS,
} from '@/services/bmsSession'
import type { ConnectionConfig } from '@/types'

// ---------------------------------------------------------------------------
// MSW server setup
// ---------------------------------------------------------------------------

const server = setupServer()
beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const config: ConnectionConfig = {
  apiUrl: 'https://test.hosxp.net',
  bearerToken: 'test-token',
  databaseType: 'postgresql' as const,
  appIdentifier: 'BMS.Dashboard.React',
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('T017 - Error Handling Contract', () => {
  // -------------------------------------------------------------------------
  // Network failure
  // -------------------------------------------------------------------------
  describe('Network failure — retrieveBmsSession', () => {
    it('throws a user-friendly error containing "Unable to connect" on fetch failure', async () => {
      server.use(
        http.get('https://hosxp.net/phapi/PasteJSON', () => {
          return HttpResponse.error()
        }),
      )

      await expect(retrieveBmsSession('some-id')).rejects.toThrow(
        /Unable to connect/,
      )
    })

    it('provides an actionable message suggesting to check connection', async () => {
      server.use(
        http.get('https://hosxp.net/phapi/PasteJSON', () => {
          return HttpResponse.error()
        }),
      )

      await expect(retrieveBmsSession('some-id')).rejects.toThrow(
        /check your internet connection/i,
      )
    })
  })

  // -------------------------------------------------------------------------
  // HTTP 501 Unauthorized — executeSqlViaApi
  // -------------------------------------------------------------------------
  describe('HTTP 501 Unauthorized — executeSqlViaApi', () => {
    it('throws an error containing "Session" or "unauthorized" for HTTP 501', async () => {
      server.use(
        http.post('https://test.hosxp.net/api/sql', () => {
          return new HttpResponse(null, { status: 501 })
        }),
      )

      await expect(
        executeSqlViaApi('SELECT 1', config),
      ).rejects.toThrow(/Session|unauthorized/i)
    })

    it('instructs the user to reconnect with a valid session ID', async () => {
      server.use(
        http.post('https://test.hosxp.net/api/sql', () => {
          return new HttpResponse(null, { status: 501 })
        }),
      )

      await expect(
        executeSqlViaApi('SELECT 1', config),
      ).rejects.toThrow(/reconnect/i)
    })
  })

  // -------------------------------------------------------------------------
  // Non-501 HTTP errors — executeSqlViaApi
  // -------------------------------------------------------------------------
  describe('Non-501 HTTP errors — executeSqlViaApi', () => {
    it('throws with the HTTP status code for non-501 errors', async () => {
      server.use(
        http.post('https://test.hosxp.net/api/sql', () => {
          return new HttpResponse(null, { status: 503 })
        }),
      )

      await expect(
        executeSqlViaApi('SELECT 1', config),
      ).rejects.toThrow(/503/)
    })
  })

  // -------------------------------------------------------------------------
  // Non-OK HTTP — retrieveBmsSession
  // -------------------------------------------------------------------------
  describe('Non-OK HTTP response — retrieveBmsSession', () => {
    it('throws with the HTTP status code for non-OK responses', async () => {
      server.use(
        http.get('https://hosxp.net/phapi/PasteJSON', () => {
          return new HttpResponse(null, { status: 500 })
        }),
      )

      await expect(retrieveBmsSession('bad-id')).rejects.toThrow(/500/)
    })

    it('provides a user-friendly message for non-OK responses', async () => {
      server.use(
        http.get('https://hosxp.net/phapi/PasteJSON', () => {
          return new HttpResponse(null, { status: 404 })
        }),
      )

      await expect(retrieveBmsSession('bad-id')).rejects.toThrow(
        /verify your session ID/i,
      )
    })
  })

  // -------------------------------------------------------------------------
  // Timeout constants
  // -------------------------------------------------------------------------
  describe('Timeout constants', () => {
    it('exports SESSION_TIMEOUT_MS as 30000', () => {
      expect(SESSION_TIMEOUT_MS).toBe(30_000)
    })

    it('exports QUERY_TIMEOUT_MS as 60000', () => {
      expect(QUERY_TIMEOUT_MS).toBe(60_000)
    })
  })

  // -------------------------------------------------------------------------
  // Session expiry detection via MessageCode 500 in body
  // -------------------------------------------------------------------------
  describe('Session expiry detection — executeSqlViaApi', () => {
    it('throws when the body reports MessageCode 500 so the caller can trigger expiry UX', async () => {
      const expiryResponse = {
        result: {},
        MessageCode: 500,
        Message: 'Session expired',
        RequestTime: '2026-03-17T10:00:00.000Z',
        data: [],
        field: [],
        field_name: [],
        record_count: 0,
      }

      server.use(
        http.post('https://test.hosxp.net/api/sql', () => {
          // HTTP 200 but MessageCode 500 in body — session expired
          return HttpResponse.json(expiryResponse)
        }),
      )

      // executeSqlViaApi throws on MessageCode >= 400 so the caller's catch
      // block runs the expiry branch. The Message text is preserved in the
      // thrown error so the UI layer can distinguish auth vs. DB errors.
      await expect(executeSqlViaApi('SELECT 1', config)).rejects.toThrow(
        /Database error:.*Session expired/i,
      )
    })
  })

  // -------------------------------------------------------------------------
  // Network failure — executeSqlViaApi
  // -------------------------------------------------------------------------
  describe('Network failure — executeSqlViaApi', () => {
    it('throws an error containing "Unable to connect" on network failure', async () => {
      server.use(
        http.post('https://test.hosxp.net/api/sql', () => {
          return HttpResponse.error()
        }),
      )

      await expect(
        executeSqlViaApi('SELECT 1', config),
      ).rejects.toThrow(/Unable to connect/i)
    })
  })

  // -------------------------------------------------------------------------
  // HTTP 429 Rate Limiting — retrieveBmsSession
  // -------------------------------------------------------------------------
  describe('HTTP 429 Rate Limiting — retrieveBmsSession', () => {
    it('throws an informative error for HTTP 429', async () => {
      server.use(
        http.get('https://hosxp.net/phapi/PasteJSON', () => {
          return new HttpResponse(null, { status: 429 })
        }),
      )

      await expect(retrieveBmsSession('some-id')).rejects.toThrow(/429/)
    })

    it('includes rate limit message in Thai', async () => {
      server.use(
        http.get('https://hosxp.net/phapi/PasteJSON', () => {
          return new HttpResponse(null, { status: 429 })
        }),
      )

      await expect(retrieveBmsSession('some-id')).rejects.toThrow(/มีการร้องขอบ่อยเกินไป/)
    })

    it('includes Retry-After header value when present', async () => {
      server.use(
        http.get('https://hosxp.net/phapi/PasteJSON', () => {
          return new HttpResponse(null, {
            status: 429,
            headers: { 'Retry-After': '30' },
          })
        }),
      )

      await expect(retrieveBmsSession('some-id')).rejects.toThrow(/30 วินาที/)
    })
  })

  // -------------------------------------------------------------------------
  // HTTP 429 Rate Limiting — executeSqlViaApi
  // -------------------------------------------------------------------------
  describe('HTTP 429 Rate Limiting — executeSqlViaApi', () => {
    it('throws an informative error for HTTP 429', async () => {
      server.use(
        http.post('https://test.hosxp.net/api/sql', () => {
          return new HttpResponse(null, { status: 429 })
        }),
      )

      await expect(
        executeSqlViaApi('SELECT 1', config),
      ).rejects.toThrow(/429/)
    })

    it('includes rate limit message in Thai', async () => {
      server.use(
        http.post('https://test.hosxp.net/api/sql', () => {
          return new HttpResponse(null, { status: 429 })
        }),
      )

      await expect(
        executeSqlViaApi('SELECT 1', config),
      ).rejects.toThrow(/มีการร้องขอบ่อยเกินไป/)
    })

    it('includes Retry-After header value when present', async () => {
      server.use(
        http.post('https://test.hosxp.net/api/sql', () => {
          return new HttpResponse(null, {
            status: 429,
            headers: { 'Retry-After': '60' },
          })
        }),
      )

      await expect(
        executeSqlViaApi('SELECT 1', config),
      ).rejects.toThrow(/60 วินาที/)
    })

    it('includes error message from response body when present', async () => {
      server.use(
        http.post('https://test.hosxp.net/api/sql', () => {
          return HttpResponse.json(
            { message: 'Rate limit exceeded for this endpoint' },
            { status: 429 },
          )
        }),
      )

      await expect(
        executeSqlViaApi('SELECT 1', config),
      ).rejects.toThrow(/Rate limit exceeded for this endpoint/)
    })
  })
})
