import { describe, it, expect } from 'vitest'
import {
  formatDate,
  formatDateTime,
  formatDateISO,
  getDateRange,
  getRelativeDate,
} from '@/utils/dateUtils'

describe('dateUtils', () => {
  describe('formatDate', () => {
    it('MUST format Date object in Thai locale', () => {
      const date = new Date(2026, 2, 17) // March 17, 2026
      expect(formatDate(date)).toBe('17 มี.ค. 2026')
    })

    it('MUST format ISO string in Thai locale', () => {
      expect(formatDate('2026-03-17')).toBe('17 มี.ค. 2026')
    })
  })

  describe('formatDateTime', () => {
    it('MUST format Date object in Thai locale with time', () => {
      const date = new Date(2026, 2, 17, 14, 30)
      expect(formatDateTime(date)).toBe('17 มี.ค. 2026 14:30')
    })
  })

  describe('formatDateISO', () => {
    it('MUST format Date object as "yyyy-MM-dd"', () => {
      const date = new Date(2026, 2, 17)
      expect(formatDateISO(date)).toBe('2026-03-17')
    })

    it('MUST format ISO string back to "yyyy-MM-dd"', () => {
      expect(formatDateISO('2026-01-05')).toBe('2026-01-05')
    })
  })

  describe('getDateRange', () => {
    it('MUST return startDate and endDate as ISO strings', () => {
      const range = getDateRange(7)
      expect(range).toHaveProperty('startDate')
      expect(range).toHaveProperty('endDate')
      expect(range.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(range.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('MUST have startDate before endDate', () => {
      const range = getDateRange(30)
      expect(range.startDate < range.endDate).toBe(true)
    })
  })

  describe('getRelativeDate', () => {
    it('MUST return a Date object in the past', () => {
      const now = new Date()
      const past = getRelativeDate(7)
      expect(past.getTime()).toBeLessThan(now.getTime())
    })

    it('MUST return approximately N days ago', () => {
      const now = new Date()
      const past = getRelativeDate(10)
      const diffDays = (now.getTime() - past.getTime()) / (1000 * 60 * 60 * 24)
      expect(Math.round(diffDays)).toBe(10)
    })
  })
})
