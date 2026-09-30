// =============================================================================
// Telemedicine Dashboard - Presentation formatter tests
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  formatNumber,
  formatBaht,
  formatPercent,
  formatChange,
  formatThaiDate,
  formatThaiDateLong,
  formatThaiMonth,
  formatTime,
  formatThaiRange,
  toBuddhistYear,
  NO_VALUE,
} from '@/utils/format';

describe('formatNumber', () => {
  it('groups thousands with commas', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('keeps the requested decimals', () => {
    expect(formatNumber(1234.567, 2)).toBe('1,234.57');
  });

  it('returns a dash for a non-finite value', () => {
    expect(formatNumber(Number.NaN)).toBe(NO_VALUE);
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe(NO_VALUE);
  });

  it('formats zero plainly', () => {
    expect(formatNumber(0)).toBe('0');
  });
});

describe('formatBaht', () => {
  it('appends the baht unit', () => {
    expect(formatBaht(117200)).toBe('117,200 บาท');
  });
});

describe('formatPercent', () => {
  it('keeps one decimal for a fractional share', () => {
    expect(formatPercent(12.34)).toBe('12.3%');
  });

  it('drops a trailing .0 so whole numbers read cleanly', () => {
    expect(formatPercent(25)).toBe('25%');
  });
});

describe('formatChange', () => {
  it('prefixes growth with a plus', () => {
    expect(formatChange(12.5)).toBe('+12.5%');
  });

  it('keeps the minus sign for decline', () => {
    expect(formatChange(-3)).toBe('-3%');
  });

  it('returns a dash when there is no baseline', () => {
    expect(formatChange(null)).toBe(NO_VALUE);
  });
});

describe('toBuddhistYear', () => {
  it('adds 543 to a CE year', () => {
    expect(toBuddhistYear(2026)).toBe(2569);
  });
});

describe('formatThaiDate', () => {
  it('renders the day, Thai month and Buddhist year', () => {
    expect(formatThaiDate('2026-09-30')).toBe('30 ก.ย. 2569');
  });

  it('ignores the time portion of an ISO timestamp', () => {
    expect(formatThaiDate('2026-09-30T13:45:00.000Z')).toBe('30 ก.ย. 2569');
  });

  it('returns a dash for an unparsable value', () => {
    expect(formatThaiDate('not-a-date')).toBe(NO_VALUE);
  });
});

describe('formatThaiDateLong', () => {
  it('uses the full Thai month name', () => {
    expect(formatThaiDateLong('2026-09-30')).toBe('30 กันยายน 2569');
  });
});

describe('formatThaiMonth', () => {
  it('renders a Thai month and Buddhist year from a yyyy-MM key', () => {
    expect(formatThaiMonth('2026-09')).toBe('ก.ย. 2569');
  });
});

describe('formatTime', () => {
  it('trims seconds', () => {
    expect(formatTime('09:15:00')).toBe('09:15');
  });

  it('returns a dash for a blank value', () => {
    expect(formatTime('')).toBe(NO_VALUE);
  });
});

describe('formatThaiRange', () => {
  it('collapses a single-day range', () => {
    expect(formatThaiRange('2026-09-30', '2026-09-30')).toBe('30 กันยายน 2569');
  });

  it('renders both ends of a wider range', () => {
    const label = formatThaiRange('2026-09-01', '2026-09-30');

    expect(label).toContain('1 ก.ย. 2569');
    expect(label).toContain('30 กันยายน 2569');
  });
});
