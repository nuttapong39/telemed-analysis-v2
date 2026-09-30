// =============================================================================
// Telemedicine Dashboard - Aggregation Service Tests
// Query construction + pure client-side aggregation over raw visit rows
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  TELEMED_ICODES,
  TELEHEALTH_ICODE,
  buildTelemedSql,
  buildTelemedParams,
  normalizeTelemedRows,
  distinctVisits,
  totalVisits,
  totalCost,
  aggregateByMonth,
  aggregateByPttype,
  aggregateByServiceType,
  buildFetchWindow,
  shiftRange,
  percentChange,
  formatPatientLabel,
  toCsv,
} from '@/services/telemed';

import type { TelemedRow } from '@/services/telemed';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SINGLE_QUOTE = String.fromCharCode(39);

/** Builds a raw API row (snake_case, stringly-typed — as the API delivers it). */
function rawRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    vn: 'VN001',
    hn: 'HN001',
    vstdate: '2026-09-01',
    vsttime: '09:15:00',
    icode: '3002416',
    service_name: 'Telehealth',
    pttype_name: 'UC',
    sum_price: '1500',
    pname: 'นาง',
    fname: 'สมศรี',
    lname: 'ใจดี',
    ...overrides,
  };
}

/** Builds a normalised typed row. */
function row(overrides: Partial<TelemedRow> = {}): TelemedRow {
  return {
    vn: 'VN001',
    hn: 'HN001',
    vstdate: '2026-09-01',
    vsttime: '09:15:00',
    icode: '3002416',
    serviceName: 'Telehealth',
    pttypeName: 'UC',
    sumPrice: 1500,
    pname: 'นาง',
    fname: 'สมศรี',
    lname: 'ใจดี',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('telemed constants', () => {
  it('covers exactly the three telemedicine service codes', () => {
    expect(TELEMED_ICODES).toEqual(['3002416', '3002487', '3002488']);
  });

  it('marks 3002416 as the telehealth service used for the cost trend', () => {
    expect(TELEHEALTH_ICODE).toBe('3002416');
    expect(TELEMED_ICODES).toContain(TELEHEALTH_ICODE);
  });
});

// ---------------------------------------------------------------------------
// buildTelemedSql
// ---------------------------------------------------------------------------

describe('buildTelemedSql', () => {
  const sql = buildTelemedSql();

  it('filters to every telemedicine icode', () => {
    for (const icode of TELEMED_ICODES) {
      expect(sql).toContain(icode);
    }
  });

  it('joins the tables needed for service name, pttype name and patient name', () => {
    for (const table of ['opitemrece', 'nondrugitems', 'ovst', 'patient', 'pttype']) {
      expect(sql).toContain(table);
    }
  });

  it('binds the date range as named parameters rather than literals', () => {
    expect(sql).toContain(':start_date');
    expect(sql).toContain(':end_date');
    expect(sql).not.toMatch(/BETWEEN\s+\d{4}-\d{2}-\d{2}/);
  });

  it('does not reference any void column this schema lacks', () => {
    const sqlWithoutAlias = sql.replace(/LEFT JOIN/g, '');
    expect(sqlWithoutAlias).not.toContain('void_staff');
  });

  it('aliases every selected column into snake_case', () => {
    for (const alias of [
      'vn',
      'hn',
      'vstdate',
      'vsttime',
      'icode',
      'service_name',
      'pttype_name',
      'sum_price',
    ]) {
      expect(sql).toContain(alias);
    }
  });
});

// ---------------------------------------------------------------------------
// buildTelemedParams
// ---------------------------------------------------------------------------

describe('buildTelemedParams', () => {
  it('produces date-typed bindings for the range', () => {
    const params = buildTelemedParams('2026-09-01', '2026-09-30');

    expect(params.start_date).toEqual({
      value: '2026-09-01',
      value_type: 'date',
    });
    expect(params.end_date).toEqual({ value: '2026-09-30', value_type: 'date' });
  });
});

// ---------------------------------------------------------------------------
// normalizeTelemedRows
// ---------------------------------------------------------------------------

describe('normalizeTelemedRows', () => {
  it('maps snake_case to camelCase and coerces numbers', () => {
    const [parsed] = normalizeTelemedRows([rawRow()]);

    expect(parsed.serviceName).toBe('Telehealth');
    expect(parsed.pttypeName).toBe('UC');
    expect(parsed.sumPrice).toBe(1500);
    expect(typeof parsed.sumPrice).toBe('number');
  });

  it('truncates a datetime vstdate to its date portion', () => {
    const [parsed] = normalizeTelemedRows([
      rawRow({ vstdate: '2026-09-01T00:00:00.000Z' }),
    ]);

    expect(parsed.vstdate).toBe('2026-09-01');
  });

  it('coerces a numeric-string sum_price and defaults junk to 0', () => {
    const rows = normalizeTelemedRows([
      rawRow({ sum_price: '250.75' }),
      rawRow({ vn: 'VN002', sum_price: null }),
      rawRow({ vn: 'VN003', sum_price: 'abc' }),
    ]);

    expect(rows.map((r) => r.sumPrice)).toEqual([250.75, 0, 0]);
  });

  it('defaults missing optional text fields to empty strings', () => {
    const [parsed] = normalizeTelemedRows([
      rawRow({ pname: null, fname: null, lname: null, pttype_name: null }),
    ]);

    expect(parsed.pname).toBe('');
    expect(parsed.fname).toBe('');
    expect(parsed.lname).toBe('');
    expect(parsed.pttypeName).toBe('');
  });

  it('drops rows without a vn', () => {
    const rows = normalizeTelemedRows([rawRow({ vn: '' }), rawRow({ vn: 'VN9' })]);

    expect(rows).toHaveLength(1);
    expect(rows[0].vn).toBe('VN9');
  });

  it('returns an empty array for undefined / empty data', () => {
    expect(normalizeTelemedRows(undefined)).toEqual([]);
    expect(normalizeTelemedRows([])).toEqual([]);
  });

  it('normalises a comma-grouped sum_price', () => {
    const [parsed] = normalizeTelemedRows([rawRow({ sum_price: '1,500.50' })]);

    expect(parsed.sumPrice).toBe(1500.5);
  });
});

// ---------------------------------------------------------------------------
// distinctVisits / totals
//
// A vn can appear on several opitemrece lines (one per item). Every headline
// number counts *visits*, so a repeated vn must collapse to a single visit.
// ---------------------------------------------------------------------------

describe('distinctVisits', () => {
  it('collapses repeated vn values to one visit', () => {
    const visits = distinctVisits([
      row({ vn: 'VN1' }),
      row({ vn: 'VN1' }),
      row({ vn: 'VN2' }),
    ]);

    expect(visits).toHaveLength(2);
  });

  it('keeps the first row seen for a vn so later aggregations are stable', () => {
    const visits = distinctVisits([
      row({ vn: 'VN1', pttypeName: 'UC' }),
      row({ vn: 'VN1', pttypeName: 'Cash' }),
    ]);

    expect(visits[0].pttypeName).toBe('UC');
  });
});

describe('totalVisits', () => {
  it('counts distinct visits, not item lines', () => {
    expect(
      totalVisits([row({ vn: 'VN1' }), row({ vn: 'VN1' }), row({ vn: 'VN2' })]),
    ).toBe(2);
  });

  it('is 0 for no rows', () => {
    expect(totalVisits([])).toBe(0);
  });
});

describe('totalCost', () => {
  it('sums sum_price across every item line', () => {
    expect(
      totalCost([row({ sumPrice: 100 }), row({ sumPrice: 250.5 })]),
    ).toBe(350.5);
  });

  it('is 0 for no rows', () => {
    expect(totalCost([])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// aggregateByMonth
// ---------------------------------------------------------------------------

describe('aggregateByMonth', () => {
  it('groups by calendar month ascending', () => {
    const points = aggregateByMonth([
      row({ vn: 'VN1', vstdate: '2026-08-05' }),
      row({ vn: 'VN2', vstdate: '2026-07-01' }),
      row({ vn: 'VN3', vstdate: '2026-08-20' }),
    ]);

    expect(points.map((p) => p.month)).toEqual(['2026-07', '2026-08']);
  });

  it('counts distinct visits per month', () => {
    const points = aggregateByMonth([
      row({ vn: 'VN1', vstdate: '2026-08-05' }),
      row({ vn: 'VN1', vstdate: '2026-08-06' }),
      row({ vn: 'VN2', vstdate: '2026-08-20' }),
    ]);

    expect(points[0].visits).toBe(2);
  });

  it('sums cost per month', () => {
    const points = aggregateByMonth([
      row({ vn: 'VN1', vstdate: '2026-08-05', sumPrice: 100 }),
      row({ vn: 'VN2', vstdate: '2026-08-20', sumPrice: 400 }),
    ]);

    expect(points[0].cost).toBe(500);
  });

  it('labels each point with a Thai month name and Buddhist year', () => {
    const points = aggregateByMonth([row({ vn: 'VN1', vstdate: '2026-08-05' })]);

    expect(points[0].label).toContain('ส.ค.');
    expect(points[0].label).toContain('2569');
  });

  it('accepts a cost filter so only the telehealth icode is summed', () => {
    const points = aggregateByMonth(
      [
        row({ vn: 'VN1', vstdate: '2026-08-05', icode: '3002416', sumPrice: 100 }),
        row({ vn: 'VN2', vstdate: '2026-08-06', icode: '3002487', sumPrice: 900 }),
      ],
      (r) => r.icode === '3002416',
    );

    expect(points[0].cost).toBe(100);
  });

  it('returns an empty array for no rows', () => {
    expect(aggregateByMonth([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// aggregateByPttype
// ---------------------------------------------------------------------------

describe('aggregateByPttype', () => {
  it('sorts by visits descending', () => {
    const points = aggregateByPttype([
      row({ vn: 'VN1', pttypeName: 'Cash' }),
      row({ vn: 'VN2', pttypeName: 'UC' }),
      row({ vn: 'VN3', pttypeName: 'UC' }),
      row({ vn: 'VN4', pttypeName: 'UC' }),
    ]);

    expect(points.map((p) => p.pttypeName)).toEqual(['UC', 'Cash']);
    expect(points[0].visits).toBe(3);
  });

  it('reports each share as a percentage of total visits', () => {
    const points = aggregateByPttype([
      row({ vn: 'VN1', pttypeName: 'UC' }),
      row({ vn: 'VN2', pttypeName: 'UC' }),
      row({ vn: 'VN3', pttypeName: 'Cash' }),
      row({ vn: 'VN4', pttypeName: 'Cash' }),
    ]);

    expect(points.map((p) => p.percent)).toEqual([50, 50]);
  });

  it('makes the percentages sum to 100', () => {
    const points = aggregateByPttype([
      row({ vn: 'VN1', pttypeName: 'A' }),
      row({ vn: 'VN2', pttypeName: 'B' }),
      row({ vn: 'VN3', pttypeName: 'C' }),
    ]);

    const sum = points.reduce((acc, p) => acc + p.percent, 0);
    expect(sum).toBeCloseTo(100, 6);
  });

  it('buckets a blank pttype name instead of dropping the visit', () => {
    const points = aggregateByPttype([
      row({ vn: 'VN1', pttypeName: '' }),
      row({ vn: 'VN2', pttypeName: 'UC' }),
    ]);

    const total = points.reduce((acc, p) => acc + p.visits, 0);
    expect(total).toBe(2);
  });

  it('is empty for no rows', () => {
    expect(aggregateByPttype([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// aggregateByServiceType
// ---------------------------------------------------------------------------

describe('aggregateByServiceType', () => {
  it('breaks visits down per icode, descending', () => {
    const points = aggregateByServiceType([
      row({ vn: 'VN1', icode: '3002416', serviceName: 'Telehealth' }),
      row({ vn: 'VN2', icode: '3002487', serviceName: 'Telemed consult' }),
      row({ vn: 'VN3', icode: '3002487', serviceName: 'Telemed consult' }),
    ]);

    expect(points.map((p) => p.icode)).toEqual(['3002487', '3002416']);
    expect(points[0].visits).toBe(2);
  });

  it('carries the service name through for display', () => {
    const points = aggregateByServiceType([
      row({ vn: 'VN1', icode: '3002416', serviceName: 'Telehealth' }),
    ]);

    expect(points[0].serviceName).toBe('Telehealth');
  });

  it('reports each service share of total visits', () => {
    const points = aggregateByServiceType([
      row({ vn: 'VN1', icode: '3002416' }),
      row({ vn: 'VN2', icode: '3002487' }),
      row({ vn: 'VN3', icode: '3002487' }),
      row({ vn: 'VN4', icode: '3002487' }),
    ]);

    expect(points[0].percent).toBe(75);
    expect(points[1].percent).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// buildFetchWindow
//
// The charts always want 12 months of context; the fetch window must widen to
// cover that even when the user picked a shorter range.
// ---------------------------------------------------------------------------

describe('buildFetchWindow', () => {
  it('widens a short range back to a full 12 months', () => {
    const { fetchStart } = buildFetchWindow('2026-09-01', '2026-09-30');

    expect(fetchStart).toBe('2025-10-01');
  });

  it('keeps the requested start when the range is already longer than 12 months', () => {
    const { fetchStart } = buildFetchWindow('2024-01-01', '2026-09-30');

    expect(fetchStart).toBe('2024-01-01');
  });

  it('does not move the end date forward', () => {
    const { fetchEnd } = buildFetchWindow('2026-09-01', '2026-09-30');

    expect(fetchEnd).toBe('2026-09-30');
  });

  it('reaches 12 months back inclusive of the end month', () => {
    // A single-month range in September must still see October of the year before.
    const { fetchStart } = buildFetchWindow('2026-09-15', '2026-09-15');

    expect(fetchStart).toBe('2025-10-01');
  });
});

// ---------------------------------------------------------------------------
// shiftRange
// ---------------------------------------------------------------------------

describe('shiftRange', () => {
  it('returns the equal-length window immediately before the range', () => {
    const { prevStart, prevEnd } = shiftRange('2026-09-01', '2026-09-30');

    expect(prevEnd).toBe('2026-08-31');
    expect(prevStart).toBe('2026-08-02');
  });

  it('handles a single-day range', () => {
    const { prevStart, prevEnd } = shiftRange('2026-09-10', '2026-09-10');

    expect(prevStart).toBe('2026-09-09');
    expect(prevEnd).toBe('2026-09-09');
  });

  it('does not overlap with the current range', () => {
    const { prevEnd } = shiftRange('2026-09-01', '2026-09-30');

    expect(prevEnd < '2026-09-01').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// percentChange
// ---------------------------------------------------------------------------

describe('percentChange', () => {
  it('reports growth as a positive percentage', () => {
    expect(percentChange(150, 100)).toBe(50);
  });

  it('reports decline as a negative percentage', () => {
    expect(percentChange(50, 100)).toBe(-50);
  });

  it('returns null when there is no baseline to compare against', () => {
    expect(percentChange(10, 0)).toBeNull();
  });

  it('is 0 for an unchanged value', () => {
    expect(percentChange(100, 100)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// formatPatientLabel
// ---------------------------------------------------------------------------

describe('formatPatientLabel', () => {
  it('joins the Thai prefix and name, keeping the HN alongside', () => {
    const label = formatPatientLabel(row());

    expect(label).toContain('นาง');
    expect(label).toContain('สมศรี');
    expect(label).toContain('HN001');
  });

  it('omits the prefix when it is blank', () => {
    const label = formatPatientLabel(row({ pname: '' }));

    expect(label.startsWith('สมศรี')).toBe(true);
  });

  it('falls back to a placeholder when no name is present', () => {
    const label = formatPatientLabel(
      row({ pname: '', fname: '', lname: '', hn: 'HN777' }),
    );

    expect(label).toContain('HN777');
    expect(label).not.toMatch(/^\s*\(/);
  });
});

// ---------------------------------------------------------------------------
// toCsv
// ---------------------------------------------------------------------------

describe('toCsv', () => {
  it('emits a header row then one row per record', () => {
    const csv = toCsv([row()]);
    const lines = csv.split('\n');

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('vn');
    expect(lines[1]).toContain('VN001');
  });

  it('quotes a value containing a comma', () => {
    const csv = toCsv([row({ pttypeName: 'UC, ระดับ 1' })]);

    expect(csv).toContain('"UC, ระดับ 1"');
  });

  it('escapes an embedded double quote by doubling it', () => {
    const csv = toCsv([row({ fname: 'สม"ชาย' })]);

    expect(csv).toContain('""');
  });

  it('neutralises a leading single quote so spreadsheets do not mangle it', () => {
    const csv = toCsv([row({ fname: `${SINGLE_QUOTE}ทดสอบ` })]);

    expect(csv).not.toContain(`, ${SINGLE_QUOTE}ทดสอบ`);
  });

  it('emits only the header for no rows', () => {
    expect(toCsv([]).split('\n')).toHaveLength(1);
  });
});
