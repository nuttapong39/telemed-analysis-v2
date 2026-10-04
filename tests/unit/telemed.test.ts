// =============================================================================
// Telemedicine Dashboard - Monthly Service Summary Tests
// Fiscal-year maths, query construction, normalisation, series + CSV
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  deriveServices,
  fiscalYearOf,
  fiscalYearRange,
  fiscalMonths,
  fiscalMonthLabel,
  fiscalYearOptions,
  elapsedMonths,
  buildTelemedFetchParams,
  buildTelemedMonthlySql,
  buildTelemedMonthlyTotalSql,
  normalizeMonthlyRows,
  normalizeMonthlyTotals,
  buildFiscalSeries,
  summarizeSeries,
  percentChange,
  toMonthlyCsv,
  csvFilename,
  SUMMARY_LIMIT,
} from '@/services/telemed';
import type { MonthlyServiceRow, TelemedService } from '@/services/telemed';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function row(overrides: Partial<MonthlyServiceRow> = {}): MonthlyServiceRow {
  return {
    month: '2025-10',
    standardCode: 'TELMED',
    icode: '3002416',
    serviceName: 'Telehealth',
    visitTypeCode: '01',
    itemRows: 10,
    visits: 8,
    qty: 10,
    amount: 1000,
    zeroPriceRows: 2,
    noVnRows: 0,
    ...overrides,
  };
}

function svc(icode: string, name = `บริการ ${icode}`): TelemedService {
  return { icode, name, standardCode: 'TELMED' };
}

/** Local-time date, so fiscal boundaries are not shifted by the TZ. */
function day(y: number, m: number, d: number): Date {
  return new Date(y, m - 1, d);
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

describe('deriveServices', () => {
  it('lists each local code found in the rows once, ordered by code', () => {
    const services = deriveServices([
      row({ icode: '3002488', serviceName: 'B2C' }),
      row({ icode: '3002416', serviceName: 'Telehealth', month: '2025-11' }),
      row({ icode: '3002488', serviceName: 'B2C', visitTypeCode: '02' }),
    ]);
    expect(services).toEqual([
      { icode: '3002416', name: 'Telehealth', standardCode: 'TELMED' },
      { icode: '3002488', name: 'B2C', standardCode: 'TELMED' },
    ]);
  });

  it('names a service by its code when the hospital left the name blank', () => {
    expect(deriveServices([row({ icode: '9000001', serviceName: '' })])[0].name).toBe(
      'รหัส 9000001',
    );
  });

  it('is empty when there are no rows', () => {
    expect(deriveServices([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Fiscal year
// ---------------------------------------------------------------------------

describe('fiscalYearOf', () => {
  it('counts 30 Sep as the end of the Buddhist-era fiscal year', () => {
    expect(fiscalYearOf(day(2026, 9, 30))).toBe(2569);
  });

  it('rolls over to the next fiscal year on 1 Oct', () => {
    expect(fiscalYearOf(day(2026, 10, 1))).toBe(2570);
  });

  it('keeps January in the fiscal year that started the October before', () => {
    expect(fiscalYearOf(day(2026, 1, 15))).toBe(2569);
  });
});

describe('fiscalYearRange', () => {
  it('spans 1 Oct of the prior CE year to 30 Sep', () => {
    expect(fiscalYearRange(2569)).toEqual({ start: '2025-10-01', end: '2026-09-30' });
  });
});

describe('fiscalMonths', () => {
  it('returns twelve months from October to September', () => {
    const months = fiscalMonths(2569);
    expect(months).toHaveLength(12);
    expect(months[0]).toBe('2025-10');
    expect(months[3]).toBe('2026-01');
    expect(months[11]).toBe('2026-09');
  });
});

describe('fiscalMonthLabel', () => {
  it('renders a short Thai month with a two-digit Buddhist year', () => {
    expect(fiscalMonthLabel('2025-10')).toBe('ต.ค. 68');
    expect(fiscalMonthLabel('2026-09')).toBe('ก.ย. 69');
  });
});

describe('fiscalYearOptions', () => {
  it('offers the current fiscal year and the four before it, newest first', () => {
    expect(fiscalYearOptions(2570)).toEqual([2570, 2569, 2568, 2567, 2566]);
  });

  it('honours a custom count', () => {
    expect(fiscalYearOptions(2569, 2)).toEqual([2569, 2568]);
  });
});

describe('elapsedMonths', () => {
  it('is 12 for a fiscal year that has ended', () => {
    expect(elapsedMonths(2568, day(2026, 9, 30))).toBe(12);
  });

  it('is 12 on the last day of the fiscal year', () => {
    expect(elapsedMonths(2569, day(2026, 9, 30))).toBe(12);
  });

  it('counts the current month on the first day of a fiscal year', () => {
    expect(elapsedMonths(2570, day(2026, 10, 1))).toBe(1);
  });

  it('counts October through the current month mid-year', () => {
    expect(elapsedMonths(2570, day(2026, 12, 15))).toBe(3);
  });

  it('is 0 for a fiscal year that has not started', () => {
    expect(elapsedMonths(2571, day(2026, 9, 30))).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

describe('buildTelemedFetchParams', () => {
  it('covers the selected fiscal year and the one before it', () => {
    const params = buildTelemedFetchParams(2569);
    expect(params.start_date).toEqual({ value: '2024-10-01', value_type: 'date' });
    expect(params.end_date).toEqual({ value: '2026-09-30', value_type: 'date' });
  });

  it('binds the TELMED standard code, ADP type 3', () => {
    const params = buildTelemedFetchParams(2569);
    expect(params.adp_code).toEqual({ value: 'TELMED', value_type: 'string' });
    expect(params.adp_type_id).toEqual({ value: 3, value_type: 'integer' });
  });
});

/** Visit identity: the VN, or HN + visit date for a charge line without one. */
const VISIT_KEY = "COALESCE(NULLIF(o.vn, ''), CONCAT(o.hn, '|', o.vstdate))";

describe('buildTelemedMonthlySql', () => {
  const sql = buildTelemedMonthlySql();

  it('groups by year and month with EXTRACT so it runs on PostgreSQL and MySQL', () => {
    expect(sql).toContain('EXTRACT(YEAR FROM o.vstdate)');
    expect(sql).toContain('EXTRACT(MONTH FROM o.vstdate)');
    expect(sql).not.toMatch(/TO_CHAR|DATE_FORMAT/);
  });

  it('selects every summary column of the monthly service query', () => {
    for (const column of [
      'standard_code',
      'local_icode',
      'service_name',
      'visit_type_code',
      'item_rows',
      'visit_count',
      'total_qty',
      'total_amount',
      'zero_price_rows',
      'no_vn_rows',
    ]) {
      expect(sql).toContain(`AS ${column}`);
    }
    expect(sql).toContain('SUM(CASE WHEN o.unitprice = 0 THEN 1 ELSE 0 END)');
  });

  it('selects items by the bound TELMED standard code, not by local icodes', () => {
    expect(sql).toContain('n.nhso_adp_code = :adp_code AND n.nhso_adp_type_id = :adp_type_id');
    expect(sql).not.toContain("'TELMED'");
    expect(sql).not.toMatch(/icode IN/i);
  });

  it('counts a visit by VN, falling back to HN + visit date when the line has no VN', () => {
    expect(sql).toContain(`COUNT(DISTINCT ${VISIT_KEY}) AS visit_count`);
    expect(sql).toContain("SUM(CASE WHEN o.vn IS NULL OR o.vn = '' THEN 1 ELSE 0 END) AS no_vn_rows");
  });

  it('left-joins the visit so lines without a VN keep their items and amount', () => {
    expect(sql).toContain('LEFT JOIN ovst v ON v.vn = o.vn');
    expect(sql.match(/JOIN ovst\b/g)).toHaveLength(1);
  });

  it('breaks each service down by visit type', () => {
    expect(sql).toMatch(/v\.ovstist\s+AS visit_type_code/);
    expect(sql).toMatch(/GROUP BY[\s\S]*v\.ovstist/);
  });

  it('binds the date window instead of interpolating it', () => {
    expect(sql).toContain('o.vstdate BETWEEN :start_date AND :end_date');
    expect(sql).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('is bounded by a LIMIT', () => {
    expect(sql).toMatch(/LIMIT \d+/);
  });
});

describe('buildTelemedMonthlyTotalSql', () => {
  const sql = buildTelemedMonthlyTotalSql();

  it('counts distinct visits per month and visit type across all services', () => {
    expect(sql).toContain(`COUNT(DISTINCT ${VISIT_KEY}) AS visit_count`);
    expect(sql).toContain('EXTRACT(MONTH FROM o.vstdate)');
    expect(sql).toMatch(/v\.ovstist\s+AS visit_type_code/);
    expect(sql).not.toMatch(/GROUP BY[^;]*icode/);
  });

  it('uses the same TELMED filter, join and date window as the service query', () => {
    expect(sql).toContain('n.nhso_adp_code = :adp_code AND n.nhso_adp_type_id = :adp_type_id');
    expect(sql).toContain('LEFT JOIN ovst v ON v.vn = o.vn');
    expect(sql).toContain('o.vstdate BETWEEN :start_date AND :end_date');
    expect(sql).toMatch(/LIMIT \d+/);
  });
});

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

describe('normalizeMonthlyRows', () => {
  it('coerces stringly-typed API values and builds a yyyy-MM month', () => {
    const [r] = normalizeMonthlyRows([
      {
        yr: '2025',
        mon: '9',
        standard_code: 'TELMED',
        local_icode: '3002487',
        service_name: ' B2B รพ.สต. ',
        visit_type_code: ' 01 ',
        item_rows: '12',
        visit_count: '10',
        total_qty: '12.00',
        total_amount: '1,500.50',
        zero_price_rows: '3',
        no_vn_rows: '2',
      },
    ]);
    expect(r).toEqual({
      month: '2025-09',
      standardCode: 'TELMED',
      icode: '3002487',
      serviceName: 'B2B รพ.สต.',
      visitTypeCode: '01',
      itemRows: 12,
      visits: 10,
      qty: 12,
      amount: 1500.5,
      zeroPriceRows: 3,
      noVnRows: 2,
    });
  });

  it('leaves the visit type blank for lines with no visit record', () => {
    const [r] = normalizeMonthlyRows([
      { yr: 2026, mon: 6, local_icode: '3002487', visit_type_code: null },
    ]);
    expect(r.visitTypeCode).toBe('');
  });

  it('throws rather than show totals from a result cut short by the LIMIT', () => {
    const full = Array.from({ length: SUMMARY_LIMIT }, () => ({
      yr: 2026,
      mon: 6,
      local_icode: '3002487',
    }));
    expect(() => normalizeMonthlyRows(full)).toThrow(/ข้อมูลมากเกินกว่าที่ดึงได้/);
  });

  it('accepts numeric year/month, including PostgreSQL numeric decimals', () => {
    const [r] = normalizeMonthlyRows([{ yr: 2026, mon: '1.0', icode: '3002416' }]);
    expect(r.month).toBe('2026-01');
  });

  it('accepts a preformatted year_month column', () => {
    const [r] = normalizeMonthlyRows([{ year_month: '2026-03', icode: '3002416' }]);
    expect(r.month).toBe('2026-03');
  });

  it('drops rows with no month or no icode', () => {
    expect(
      normalizeMonthlyRows([
        { local_icode: '3002416' },
        { yr: '2026', mon: '13', local_icode: '3002416' },
        { yr: '2026', mon: '1', local_icode: null },
      ]),
    ).toEqual([]);
  });

  it('keeps any local code the TELMED filter returned, not just known ones', () => {
    const [r] = normalizeMonthlyRows([{ yr: '2026', mon: '1', local_icode: '9999999' }]);
    expect(r.icode).toBe('9999999');
  });

  it('returns an empty list for missing data', () => {
    expect(normalizeMonthlyRows(undefined)).toEqual([]);
  });
});

describe('normalizeMonthlyTotals', () => {
  it('maps each month and visit type to its distinct visit count', () => {
    expect(
      normalizeMonthlyTotals([
        { yr: '2025', mon: '10', visit_type_code: '01', visit_count: '7' },
        { yr: '2025', mon: '11', visit_type_code: null, visit_count: 3 },
      ]),
    ).toEqual([
      { month: '2025-10', visitTypeCode: '01', visits: 7 },
      { month: '2025-11', visitTypeCode: '', visits: 3 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Series
// ---------------------------------------------------------------------------

describe('buildFiscalSeries', () => {
  const today = day(2026, 9, 30);
  const services = [svc('3002416'), svc('3002487'), svc('3002488')];

  it('always returns the twelve fiscal months, filling gaps with zeros', () => {
    const series = buildFiscalSeries([], [], services, 2569, today);
    expect(series.map((p) => p.month)).toEqual(fiscalMonths(2569));
    expect(series[0].label).toBe('ต.ค. 68');
    expect(series[0].total.visits).toBe(0);
    expect(series[0].services['3002416'].amount).toBe(0);
  });

  it('places each row under its service, zero-filling the others', () => {
    const series = buildFiscalSeries(
      [
        row({ icode: '3002487', visits: 3, amount: 300 }),
        row({ icode: '3002416', visits: 5, amount: 500 }),
      ],
      [],
      services,
      2569,
      today,
    );
    expect(series[0].services['3002487'].visits).toBe(3);
    expect(series[0].services['3002416'].amount).toBe(500);
    expect(series[0].services['3002488'].visits).toBe(0);
  });

  it('adds up the visit types of one service', () => {
    const series = buildFiscalSeries(
      [
        row({ icode: '3002487', visitTypeCode: '01', visits: 3, noVnRows: 0 }),
        row({ icode: '3002487', visitTypeCode: '', visits: 2, noVnRows: 2 }),
      ],
      [],
      services,
      2569,
      today,
    );
    expect(series[0].services['3002487']).toMatchObject({ visits: 5, noVnRows: 2 });
  });

  it('has no service columns when the hospital has no TELMED services', () => {
    expect(buildFiscalSeries([], [], [], 2569, today)[0].services).toEqual({});
  });

  it('ignores rows outside the fiscal year', () => {
    const series = buildFiscalSeries([row({ month: '2025-09' })], [], services, 2569, today);
    expect(series.every((p) => p.total.visits === 0)).toBe(true);
  });

  it('sums every metric for the month total', () => {
    const series = buildFiscalSeries(
      [
        row({ icode: '3002487', itemRows: 4, qty: 5, amount: 100, zeroPriceRows: 1 }),
        row({ icode: '3002488', itemRows: 6, qty: 7, amount: 200, zeroPriceRows: 2 }),
      ],
      [],
      services,
      2569,
      today,
    );
    expect(series[0].total).toMatchObject({
      itemRows: 10,
      qty: 12,
      amount: 300,
      zeroPriceRows: 3,
    });
  });

  it('prefers the distinct monthly visit total so shared visits are not double-counted', () => {
    const series = buildFiscalSeries(
      [row({ icode: '3002487', visits: 3 }), row({ icode: '3002416', visits: 3 })],
      [
        { month: '2025-10', visitTypeCode: '01', visits: 4 },
        { month: '2025-10', visitTypeCode: '', visits: 1 },
      ],
      services,
      2569,
      today,
    );
    expect(series[0].total.visits).toBe(5);
  });

  it('falls back to summing service visits when no total is available', () => {
    const series = buildFiscalSeries(
      [row({ icode: '3002487', visits: 3 }), row({ icode: '3002416', visits: 3 })],
      [],
      services,
      2569,
      today,
    );
    expect(series[0].total.visits).toBe(6);
  });

  it('flags months after today as future', () => {
    const series = buildFiscalSeries([], [], services, 2570, day(2026, 12, 15));
    expect(series.map((p) => p.isFuture)).toEqual([
      false, false, false, true, true, true, true, true, true, true, true, true,
    ]);
  });
});

describe('summarizeSeries', () => {
  const series = buildFiscalSeries(
    [
      row({ month: '2025-10', icode: '3002487', visits: 2, amount: 200 }),
      row({ month: '2025-11', icode: '3002487', visits: 3, amount: 300 }),
      row({ month: '2025-12', icode: '3002416', visits: 4, amount: 400 }),
    ],
    [],
    [svc('3002416'), svc('3002487')],
    2569,
    day(2026, 9, 30),
  );

  it('sums the whole year by default', () => {
    const sum = summarizeSeries(series);
    expect(sum.total.visits).toBe(9);
    expect(sum.services['3002487'].amount).toBe(500);
    expect(sum.services['3002416'].visits).toBe(4);
  });

  it('sums only the first N months for a year-to-date comparison', () => {
    const sum = summarizeSeries(series, 2);
    expect(sum.total.visits).toBe(5);
    expect(sum.services['3002416'].visits).toBe(0);
  });
});

describe('percentChange', () => {
  it('rounds to one decimal', () => {
    expect(percentChange(115, 100)).toBe(15);
    expect(percentChange(1, 3)).toBe(-66.7);
  });

  it('is null when there is no baseline', () => {
    expect(percentChange(10, 0)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

describe('toMonthlyCsv', () => {
  it('emits the query columns for the fiscal year only, ordered by month then icode', () => {
    const csv = toMonthlyCsv(
      [
        row({ month: '2025-11', icode: '3002416' }),
        row({ month: '2025-10', icode: '3002488', serviceName: 'B2C, คนไข้' }),
        row({ month: '2025-10', icode: '3002416' }),
        row({ month: '2024-10', icode: '3002416' }),
      ],
      2569,
    );
    const lines = csv.split('\n');
    expect(lines[0]).toBe(
      'year_month,icode,service_name,item_rows,visit_count,total_qty,total_amount,zero_price_rows',
    );
    expect(lines.slice(1).map((l) => l.split(',').slice(0, 2).join(','))).toEqual([
      '2025-10,3002416',
      '2025-10,3002488',
      '2025-11,3002416',
    ]);
    expect(lines[2]).toContain('"B2C, คนไข้"');
  });
});

describe('csvFilename', () => {
  it('names the export after the fiscal year', () => {
    expect(csvFilename(2569)).toBe('telemed-fy2569.csv');
  });
});
