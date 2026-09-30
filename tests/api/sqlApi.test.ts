// =============================================================================
// T016 - API Contract Tests: SQL Query Execution (/api/sql)
// Tests the BMS SQL query execution contract using MSW v2 to intercept HTTP
// requests at the network level and validate request/response contracts.
// =============================================================================

import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest'

import { executeSqlViaApi } from '@/services/bmsSession'
import type { ConnectionConfig, SqlApiResponse } from '@/types'

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

const successSqlResponse: SqlApiResponse = {
  result: {},
  MessageCode: 200,
  Message: 'OK',
  RequestTime: '2026-03-17T10:00:00.000Z',
  data: [{ total: 1234 }],
  field: [2],
  field_name: ['total'],
  record_count: 1,
}

const syntaxErrorResponse: SqlApiResponse = {
  result: {},
  MessageCode: 409,
  Message: 'SQL syntax error near "SELCT"',
  RequestTime: '2026-03-17T10:00:00.000Z',
  data: [],
  field: [],
  field_name: [],
  record_count: 0,
}

const serverErrorResponse: SqlApiResponse = {
  result: {},
  MessageCode: 500,
  Message: 'Internal server error',
  RequestTime: '2026-03-17T10:00:00.000Z',
  data: [],
  field: [],
  field_name: [],
  record_count: 0,
}

const multiFieldResponse: SqlApiResponse = {
  result: {},
  MessageCode: 200,
  Message: 'OK',
  RequestTime: '2026-03-17T10:00:00.000Z',
  data: [
    {
      is_active: true,
      count: 42,
      avg_score: 3.14,
      created_at: '2026-03-17T00:00:00Z',
      start_time: '08:30:00',
      name: 'Test Record',
      blob_data: 'base64data==',
      notes: 'Some text',
    },
  ],
  field: [1, 2, 3, 4, 5, 6, 7, 9],
  field_name: [
    'is_active',
    'count',
    'avg_score',
    'created_at',
    'start_time',
    'name',
    'blob_data',
    'notes',
  ],
  record_count: 1,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('T016 - SQL Query Execution Contract (/api/sql)', () => {
  // -------------------------------------------------------------------------
  // Success scenario
  // -------------------------------------------------------------------------
  describe('executeSqlViaApi — success', () => {
    it('sends Authorization: Bearer header with the configured token', async () => {
      let capturedAuthHeader = ''

      server.use(
        http.post('https://test.hosxp.net/api/sql', ({ request }) => {
          capturedAuthHeader = request.headers.get('Authorization') ?? ''
          return HttpResponse.json(successSqlResponse)
        }),
      )

      await executeSqlViaApi('SELECT COUNT(*) as total FROM ovst', config)

      expect(capturedAuthHeader).toBe('Bearer test-token')
    })

    it('sends request body with sql and app fields', async () => {
      let capturedBody: Record<string, unknown> = {}

      server.use(
        http.post('https://test.hosxp.net/api/sql', async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>
          return HttpResponse.json(successSqlResponse)
        }),
      )

      await executeSqlViaApi('SELECT COUNT(*) as total FROM ovst', config)

      expect(capturedBody.sql).toBe('SELECT COUNT(*) as total FROM ovst')
      expect(capturedBody.app).toBe('BMS.Dashboard.React')
    })

    it('sends Content-Type: application/json header', async () => {
      let capturedContentType = ''

      server.use(
        http.post('https://test.hosxp.net/api/sql', ({ request }) => {
          capturedContentType = request.headers.get('Content-Type') ?? ''
          return HttpResponse.json(successSqlResponse)
        }),
      )

      await executeSqlViaApi('SELECT 1', config)

      expect(capturedContentType).toBe('application/json')
    })

    it('returns parsed response with data array, field_name, and record_count', async () => {
      server.use(
        http.post('https://test.hosxp.net/api/sql', () => {
          return HttpResponse.json(successSqlResponse)
        }),
      )

      const result = await executeSqlViaApi(
        'SELECT COUNT(*) as total FROM ovst',
        config,
      )

      expect(result.MessageCode).toBe(200)
      expect(result.data).toBeDefined()
      expect(result.data).toHaveLength(1)
      expect(result.data?.[0]).toEqual({ total: 1234 })
      expect(result.field_name).toEqual(['total'])
      expect(result.record_count).toBe(1)
    })

    it('posts to {apiUrl}/api/sql endpoint', async () => {
      let capturedUrl = ''

      server.use(
        http.post('https://test.hosxp.net/api/sql', ({ request }) => {
          capturedUrl = request.url
          return HttpResponse.json(successSqlResponse)
        }),
      )

      await executeSqlViaApi('SELECT 1', config)

      // URL includes a cache-busting `random` query param; match the prefix.
      expect(capturedUrl).toMatch(/^https:\/\/test\.hosxp\.net\/api\/sql(\?|$)/)
    })
  })

  // -------------------------------------------------------------------------
  // SQL error scenario (409)
  // -------------------------------------------------------------------------
  describe('executeSqlViaApi — SQL syntax error (409)', () => {
    it('throws a "Database error" for a SQL syntax error', async () => {
      server.use(
        http.post('https://test.hosxp.net/api/sql', () => {
          return HttpResponse.json(syntaxErrorResponse)
        }),
      )

      await expect(
        executeSqlViaApi('SELCT * FROM ovst', config),
      ).rejects.toThrow(/Database error:.*syntax error/i)
    })
  })

  // -------------------------------------------------------------------------
  // Server error scenario (500)
  // -------------------------------------------------------------------------
  describe('executeSqlViaApi — server error (500)', () => {
    it('throws a "Database error" for a server-side error', async () => {
      server.use(
        http.post('https://test.hosxp.net/api/sql', () => {
          return HttpResponse.json(serverErrorResponse)
        }),
      )

      await expect(
        executeSqlViaApi('SELECT * FROM ovst', config),
      ).rejects.toThrow(/Database error:.*Internal server error/i)
    })
  })

  // -------------------------------------------------------------------------
  // Field type codes
  // -------------------------------------------------------------------------
  describe('executeSqlViaApi — field type codes', () => {
    it('returns all documented field type codes (1-7, 9) in the response', async () => {
      server.use(
        http.post('https://test.hosxp.net/api/sql', () => {
          return HttpResponse.json(multiFieldResponse)
        }),
      )

      const result = await executeSqlViaApi('SELECT * FROM sample_table', config)

      expect(result.field).toBeDefined()
      expect(result.field).toEqual([1, 2, 3, 4, 5, 6, 7, 9])

      // Verify each documented field type code is present
      const fieldCodes = result.field!
      expect(fieldCodes).toContain(1) // Boolean
      expect(fieldCodes).toContain(2) // Integer
      expect(fieldCodes).toContain(3) // Float
      expect(fieldCodes).toContain(4) // DateTime
      expect(fieldCodes).toContain(5) // Time
      expect(fieldCodes).toContain(6) // String
      expect(fieldCodes).toContain(7) // Blob
      expect(fieldCodes).toContain(9) // String (alternate)
    })

    it('field_name array length matches field array length', async () => {
      server.use(
        http.post('https://test.hosxp.net/api/sql', () => {
          return HttpResponse.json(multiFieldResponse)
        }),
      )

      const result = await executeSqlViaApi('SELECT * FROM sample_table', config)

      expect(result.field).toBeDefined()
      expect(result.field_name).toBeDefined()
      expect(result.field!.length).toBe(result.field_name!.length)
    })
  })
})
