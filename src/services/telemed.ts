// =============================================================================
// Telemedicine Dashboard - Monthly Service Summary
//
// Two responsibilities, deliberately kept apart:
//   1. Build the summary queries: one row per (month × service), plus a
//      per-month distinct-visit total across services.
//   2. Reduce those rows, entirely client-side, into fiscal-year series,
//      year-to-date sums and the CSV export.
//
// The dashboard reads monthly aggregates only — never patient-level rows.
// All reduction functions are pure so they are cheap to unit-test.
// =============================================================================

import { addMonths, format, parseISO } from 'date-fns';
import { th } from 'date-fns/locale';
import type { SqlParams } from '@/types';

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

export type ServiceKey = 'b2b' | 'b2c' | 'telehealth';

export interface TelemedService {
  key: ServiceKey;
  icode: string;
  label: string;
  /** One-line meaning shown under the label. */
  description: string;
}

/** The three telemedicine services, in display order. */
export const TELEMED_SERVICES: readonly TelemedService[] = [
  { key: 'b2b', icode: '3002487', label: 'B2B', description: 'บริการร่วมกับ รพ.สต.' },
  { key: 'b2c', icode: '3002488', label: 'B2C', description: 'คนไข้โดยตรงผ่านวิดีโอคอล/แอป' },
  { key: 'telehealth', icode: '3002416', label: 'Telehealth', description: 'โทรทางไกลผ่านมือถือ' },
];

export const TELEMED_ICODES: readonly string[] = TELEMED_SERVICES.map((s) => s.icode);

const SERVICE_BY_ICODE = new Map(TELEMED_SERVICES.map((s) => [s.icode, s]));

/** Upper bound on summary rows: 24 months × 3 services, with headroom. */
const SUMMARY_LIMIT = 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One (month × service) summary row, normalised. */
export interface MonthlyServiceRow {
  /** `yyyy-MM` */
  month: string;
  icode: string;
  serviceName: string;
  itemRows: number;
  visits: number;
  qty: number;
  amount: number;
  zeroPriceRows: number;
}

/** Distinct visits in a month across all three services. */
export interface MonthlyTotalRow {
  month: string;
  visits: number;
}

export interface Metrics {
  itemRows: number;
  visits: number;
  qty: number;
  amount: number;
  zeroPriceRows: number;
}

export interface FiscalMonthPoint {
  /** `yyyy-MM` */
  month: string;
  /** `ต.ค. 68` */
  label: string;
  /** The month has not started yet. */
  isFuture: boolean;
  services: Record<ServiceKey, Metrics>;
  total: Metrics;
}

export interface SeriesSummary {
  services: Record<ServiceKey, Metrics>;
  total: Metrics;
}

// ---------------------------------------------------------------------------
// Coercion helpers
// ---------------------------------------------------------------------------

/** Coerce an unknown API value to a trimmed string. */
function str(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/**
 * Coerce an unknown API value to a finite number.
 *
 * The API can hand back numbers as strings, occasionally with thousands
 * separators, and blanks for NULL. Anything uninterpretable becomes `0` so a
 * single bad row cannot poison a whole SUM.
 */
function num(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const cleaned = str(value).replace(/,/g, '');
  if (cleaned === '') return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Build `yyyy-MM` from `year_month`, or from separate EXTRACT columns. */
function toMonth(raw: Record<string, unknown>): string {
  const preformatted = str(raw.year_month);
  if (/^\d{4}-\d{2}$/.test(preformatted)) return preformatted;

  const year = Math.trunc(num(raw.yr));
  const month = Math.trunc(num(raw.mon));
  if (year < 1900 || month < 1 || month > 12) return '';
  return `${year}-${String(month).padStart(2, '0')}`;
}

function emptyMetrics(): Metrics {
  return { itemRows: 0, visits: 0, qty: 0, amount: 0, zeroPriceRows: 0 };
}

function emptyServices(): Record<ServiceKey, Metrics> {
  return { b2b: emptyMetrics(), b2c: emptyMetrics(), telehealth: emptyMetrics() };
}

function addInto(target: Metrics, source: Metrics): void {
  target.itemRows += source.itemRows;
  target.visits += source.visits;
  target.qty += source.qty;
  target.amount += source.amount;
  target.zeroPriceRows += source.zeroPriceRows;
}

// ---------------------------------------------------------------------------
// Fiscal year (Buddhist era, 1 Oct – 30 Sep)
// ---------------------------------------------------------------------------

const BE_OFFSET = 543;
/** October, as a 0-based JS month. */
const FISCAL_START_MONTH = 9;

/** The fiscal year (BE) that `date` falls in. */
export function fiscalYearOf(date: Date): number {
  const ceYear = date.getMonth() >= FISCAL_START_MONTH ? date.getFullYear() + 1 : date.getFullYear();
  return ceYear + BE_OFFSET;
}

/** First and last day of a fiscal year, `yyyy-MM-dd`. */
export function fiscalYearRange(fiscalYear: number): { start: string; end: string } {
  const endCe = fiscalYear - BE_OFFSET;
  return { start: `${endCe - 1}-10-01`, end: `${endCe}-09-30` };
}

/** The twelve `yyyy-MM` months of a fiscal year, October first. */
export function fiscalMonths(fiscalYear: number): string[] {
  const first = parseISO(fiscalYearRange(fiscalYear).start);
  return Array.from({ length: 12 }, (_, i) => format(addMonths(first, i), 'yyyy-MM'));
}

/** `2025-10` → `ต.ค. 68`. */
export function fiscalMonthLabel(month: string): string {
  const date = parseISO(`${month}-01`);
  const shortYear = String(date.getFullYear() + BE_OFFSET).slice(-2);
  return `${format(date, 'MMM', { locale: th })} ${shortYear}`;
}

/** Selectable fiscal years, newest first. */
export function fiscalYearOptions(current: number, count = 5): number[] {
  return Array.from({ length: count }, (_, i) => current - i);
}

/**
 * How many months of `fiscalYear` have started by `today` (0–12).
 *
 * Used to compare year-to-date against the same months of the prior year, so
 * an in-progress year is never measured against a full one.
 */
export function elapsedMonths(fiscalYear: number, today: Date): number {
  const current = format(today, 'yyyy-MM');
  return fiscalMonths(fiscalYear).filter((m) => m <= current).length;
}

// ---------------------------------------------------------------------------
// SQL construction
// ---------------------------------------------------------------------------

/**
 * Date bindings covering the selected fiscal year and the one before it, so a
 * single fetch serves both the chart and the year-over-year comparison.
 */
export function buildTelemedFetchParams(fiscalYear: number): SqlParams {
  return {
    start_date: { value: fiscalYearRange(fiscalYear - 1).start, value_type: 'date' },
    end_date: { value: fiscalYearRange(fiscalYear).end, value_type: 'date' },
  };
}

function icodeList(): string {
  return TELEMED_ICODES.map((code) => `'${code}'`).join(', ');
}

/**
 * One row per (month × service).
 *
 * Year and month are grouped with `EXTRACT`, which PostgreSQL and MySQL both
 * support, and joined into `yyyy-MM` client-side — `TO_CHAR` is PostgreSQL-only.
 */
export function buildTelemedMonthlySql(): string {
  return [
    'SELECT',
    '  EXTRACT(YEAR FROM o.vstdate)  AS yr,',
    '  EXTRACT(MONTH FROM o.vstdate) AS mon,',
    '  n.icode                       AS icode,',
    '  n.name                        AS service_name,',
    '  COUNT(*)                      AS item_rows,',
    '  COUNT(DISTINCT o.vn)          AS visit_count,',
    '  SUM(o.qty)                    AS total_qty,',
    '  SUM(o.sum_price)              AS total_amount,',
    '  SUM(CASE WHEN o.unitprice = 0 THEN 1 ELSE 0 END) AS zero_price_rows',
    'FROM opitemrece o',
    'JOIN nondrugitems n ON o.icode = n.icode',
    `WHERE o.icode IN (${icodeList()})`,
    '  AND o.vstdate BETWEEN :start_date AND :end_date',
    'GROUP BY EXTRACT(YEAR FROM o.vstdate), EXTRACT(MONTH FROM o.vstdate), n.icode, n.name',
    'ORDER BY yr, mon, icode',
    `LIMIT ${SUMMARY_LIMIT}`,
  ].join('\n');
}

/**
 * Distinct visits per month across all three services.
 *
 * A visit that carries two telemedicine codes appears once per service in
 * {@link buildTelemedMonthlySql}; this keeps the all-services total exact.
 */
export function buildTelemedMonthlyTotalSql(): string {
  return [
    'SELECT',
    '  EXTRACT(YEAR FROM o.vstdate)  AS yr,',
    '  EXTRACT(MONTH FROM o.vstdate) AS mon,',
    '  COUNT(DISTINCT o.vn) AS visit_count',
    'FROM opitemrece o',
    `WHERE o.icode IN (${icodeList()})`,
    '  AND o.vstdate BETWEEN :start_date AND :end_date',
    'GROUP BY EXTRACT(YEAR FROM o.vstdate), EXTRACT(MONTH FROM o.vstdate)',
    'ORDER BY yr, mon',
    `LIMIT ${SUMMARY_LIMIT}`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/**
 * Normalise raw monthly summary rows.
 *
 * Rows without a valid month, or for an icode outside the three services, are
 * dropped rather than guessed at.
 */
export function normalizeMonthlyRows(
  data: readonly unknown[] | undefined,
): MonthlyServiceRow[] {
  if (!data) return [];

  const rows: MonthlyServiceRow[] = [];
  for (const entry of data) {
    const raw = entry as Record<string, unknown>;
    const month = toMonth(raw);
    const icode = str(raw.icode);
    if (month === '' || !SERVICE_BY_ICODE.has(icode)) continue;

    rows.push({
      month,
      icode,
      serviceName: str(raw.service_name),
      itemRows: num(raw.item_rows),
      visits: num(raw.visit_count),
      qty: num(raw.total_qty),
      amount: num(raw.total_amount),
      zeroPriceRows: num(raw.zero_price_rows),
    });
  }
  return rows;
}

/** Normalise raw per-month distinct-visit totals. */
export function normalizeMonthlyTotals(
  data: readonly unknown[] | undefined,
): MonthlyTotalRow[] {
  if (!data) return [];

  const rows: MonthlyTotalRow[] = [];
  for (const entry of data) {
    const raw = entry as Record<string, unknown>;
    const month = toMonth(raw);
    if (month === '') continue;
    rows.push({ month, visits: num(raw.visit_count) });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Series
// ---------------------------------------------------------------------------

/**
 * The twelve months of `fiscalYear`, each broken down by service.
 *
 * Months with no rows are present with zeros, so charts keep a fixed axis.
 * The month total's visit count comes from `totals` when available, since
 * summing per-service visits can double-count a visit billed under two codes.
 */
export function buildFiscalSeries(
  rows: readonly MonthlyServiceRow[],
  totals: readonly MonthlyTotalRow[],
  fiscalYear: number,
  today: Date,
): FiscalMonthPoint[] {
  const current = format(today, 'yyyy-MM');
  const totalByMonth = new Map(totals.map((t) => [t.month, t.visits]));

  const points = fiscalMonths(fiscalYear).map<FiscalMonthPoint>((month) => ({
    month,
    label: fiscalMonthLabel(month),
    isFuture: month > current,
    services: emptyServices(),
    total: emptyMetrics(),
  }));
  const pointByMonth = new Map(points.map((p) => [p.month, p]));

  for (const r of rows) {
    const point = pointByMonth.get(r.month);
    const service = SERVICE_BY_ICODE.get(r.icode);
    if (!point || !service) continue;
    addInto(point.services[service.key], r);
    addInto(point.total, r);
  }

  for (const point of points) {
    const distinct = totalByMonth.get(point.month);
    if (distinct !== undefined) point.total.visits = distinct;
  }

  return points;
}

/** Sum the first `monthCount` months of a series (defaults to all of them). */
export function summarizeSeries(
  series: readonly FiscalMonthPoint[],
  monthCount = series.length,
): SeriesSummary {
  const summary: SeriesSummary = { services: emptyServices(), total: emptyMetrics() };
  for (const point of series.slice(0, monthCount)) {
    for (const service of TELEMED_SERVICES) {
      addInto(summary.services[service.key], point.services[service.key]);
    }
    addInto(summary.total, point.total);
  }
  return summary;
}

/**
 * Percentage change from `previous` to `current`, rounded to one decimal.
 *
 * Returns `null` when there is no baseline — a jump from zero is not
 * meaningfully expressible as a percentage.
 */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** Columns emitted by {@link toMonthlyCsv}, matching the summary query. */
const CSV_COLUMNS: ReadonlyArray<{
  header: string;
  get: (r: MonthlyServiceRow) => string;
}> = [
  { header: 'year_month', get: (r) => r.month },
  { header: 'icode', get: (r) => r.icode },
  { header: 'service_name', get: (r) => r.serviceName },
  { header: 'item_rows', get: (r) => String(r.itemRows) },
  { header: 'visit_count', get: (r) => String(r.visits) },
  { header: 'total_qty', get: (r) => String(r.qty) },
  { header: 'total_amount', get: (r) => String(r.amount) },
  { header: 'zero_price_rows', get: (r) => String(r.zeroPriceRows) },
];

/** RFC-4180 field escaping, with Excel's leading-quote quirk handled. */
function csvField(value: string): string {
  // Excel treats a leading apostrophe as a text marker and hides it; drop it
  // so what the user sees in the sheet matches what is in the database.
  const withoutMarker = value.startsWith("'") ? value.slice(1) : value;
  if (/[",\n\r]/.test(withoutMarker)) {
    return `"${withoutMarker.replaceAll('"', '""')}"`;
  }
  return withoutMarker;
}

/** The fiscal year's summary rows as CSV, ordered by month then icode. */
export function toMonthlyCsv(rows: readonly MonthlyServiceRow[], fiscalYear: number): string {
  const months = new Set(fiscalMonths(fiscalYear));
  const selected = rows
    .filter((r) => months.has(r.month))
    .sort((a, b) => a.month.localeCompare(b.month) || a.icode.localeCompare(b.icode));

  const lines = [CSV_COLUMNS.map((c) => c.header).join(',')];
  for (const r of selected) {
    lines.push(CSV_COLUMNS.map((c) => csvField(c.get(r))).join(','));
  }
  return lines.join('\n');
}

/** `telemed-fy2569.csv` */
export function csvFilename(fiscalYear: number): string {
  return `telemed-fy${fiscalYear}.csv`;
}
