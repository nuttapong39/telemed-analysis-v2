// =============================================================================
// Telemedicine Dashboard - Monthly Service Summary
//
// Two responsibilities, deliberately kept apart:
//   1. Build the summary queries: one row per (month × service × visit type),
//      plus a per-(month × visit type) distinct-visit total across services.
//   2. Reduce those rows, entirely client-side, into fiscal-year series,
//      year-to-date sums and the CSV export.
//
// A service is any local code mapped to the NHSO standard code TELMED, so the
// set of services differs per hospital and is read from the data.
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

/** A local code mapped to the TELMED standard code. */
export interface TelemedService {
  icode: string;
  name: string;
  standardCode: string;
}

/** Selection key for "all services" — icodes are numeric, so it never clashes. */
export const TOTAL_KEY = 'total';

/**
 * Upper bound on summary rows: 24 months × services × visit types, with
 * headroom. Reaching it means the result was cut short, which is an error.
 */
export const SUMMARY_LIMIT = 5000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Metrics {
  itemRows: number;
  visits: number;
  qty: number;
  amount: number;
  zeroPriceRows: number;
  /** Lines with no VN, counted as visits by HN + visit date instead. */
  noVnRows: number;
}

/** One (month × service × visit type) summary row, normalised. */
export interface MonthlyServiceRow extends Metrics {
  /** `yyyy-MM` */
  month: string;
  standardCode: string;
  icode: string;
  serviceName: string;
  /** `''` when the line has no visit record. */
  visitTypeCode: string;
}

/** Distinct visits in a (month × visit type) across all services. */
export interface MonthlyTotalRow {
  month: string;
  visitTypeCode: string;
  visits: number;
}

export interface FiscalMonthPoint {
  /** `yyyy-MM` */
  month: string;
  /** `ต.ค. 68` */
  label: string;
  /** The month has not started yet. */
  isFuture: boolean;
  /** Keyed by icode; every service of the series is present, zero-filled. */
  services: Record<string, Metrics>;
  total: Metrics;
}

export interface SeriesSummary {
  /** Keyed by icode. */
  services: Record<string, Metrics>;
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

export function emptyMetrics(): Metrics {
  return { itemRows: 0, visits: 0, qty: 0, amount: 0, zeroPriceRows: 0, noVnRows: 0 };
}

function emptyServices(services: readonly TelemedService[]): Record<string, Metrics> {
  return Object.fromEntries(services.map((s) => [s.icode, emptyMetrics()]));
}

/** Add `source` into `target`, metric by metric. */
export function addInto(target: Metrics, source: Metrics): void {
  target.itemRows += source.itemRows;
  target.visits += source.visits;
  target.qty += source.qty;
  target.amount += source.amount;
  target.zeroPriceRows += source.zeroPriceRows;
  target.noVnRows += source.noVnRows;
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

/** NHSO ADP standard code shared by every hospital's telemedicine items. */
export const TELMED_ADP_CODE = 'TELMED';
/** ADP item type the TELMED code is registered under. */
export const TELMED_ADP_TYPE_ID = 3;

/**
 * Bindings for both summary queries: the TELMED standard code, and dates
 * covering the selected fiscal year and the one before it, so a single fetch
 * serves both the chart and the year-over-year comparison.
 */
export function buildTelemedFetchParams(fiscalYear: number): SqlParams {
  return {
    start_date: { value: fiscalYearRange(fiscalYear - 1).start, value_type: 'date' },
    end_date: { value: fiscalYearRange(fiscalYear).end, value_type: 'date' },
    adp_code: { value: TELMED_ADP_CODE, value_type: 'string' },
    adp_type_id: { value: TELMED_ADP_TYPE_ID, value_type: 'integer' },
  };
}

/**
 * A visit's identity: its VN, or HN + visit date when the charge line carries
 * no VN. Some databases hold telemedicine charges without a VN; counting VNs
 * alone reported zero visits for them. The HN is coalesced so MySQL (CONCAT
 * of NULL is NULL) and PostgreSQL (concat skips NULLs) count alike.
 */
const VISIT_KEY = "COALESCE(NULLIF(o.vn, ''), CONCAT(COALESCE(o.hn, ''), '|', o.vstdate))";

/** Telemedicine charge lines in the bound date window, with their visit. */
const TELMED_FROM = [
  'FROM opitemrece o',
  'JOIN nondrugitems n ON n.icode = o.icode',
  // LEFT: a line with no VN, or a VN missing from ovst, keeps its amount.
  'LEFT JOIN ovst v ON v.vn = o.vn',
  'WHERE n.nhso_adp_code = :adp_code AND n.nhso_adp_type_id = :adp_type_id',
  '  AND o.vstdate BETWEEN :start_date AND :end_date',
];

/**
 * One row per (month × service × visit type).
 *
 * Year and month are grouped with `EXTRACT`, which PostgreSQL and MySQL both
 * support, and joined into `yyyy-MM` client-side — `TO_CHAR` is PostgreSQL-only.
 * Each visit has one visit type, so visit counts sum exactly across types.
 */
export function buildTelemedMonthlySql(): string {
  return [
    'SELECT',
    '  EXTRACT(YEAR FROM o.vstdate)  AS yr,',
    '  EXTRACT(MONTH FROM o.vstdate) AS mon,',
    '  n.nhso_adp_code               AS standard_code,',
    '  n.icode                       AS local_icode,',
    '  n.name                        AS service_name,',
    '  v.ovstist                     AS visit_type_code,',
    '  COUNT(*)                      AS item_rows,',
    `  COUNT(DISTINCT ${VISIT_KEY}) AS visit_count,`,
    '  SUM(o.qty)                    AS total_qty,',
    '  SUM(o.sum_price)              AS total_amount,',
    '  SUM(CASE WHEN o.unitprice = 0 THEN 1 ELSE 0 END) AS zero_price_rows,',
    "  SUM(CASE WHEN o.vn IS NULL OR o.vn = '' THEN 1 ELSE 0 END) AS no_vn_rows",
    ...TELMED_FROM,
    'GROUP BY EXTRACT(YEAR FROM o.vstdate), EXTRACT(MONTH FROM o.vstdate),',
    '  n.nhso_adp_code, n.icode, n.name, v.ovstist',
    'ORDER BY yr, mon, local_icode, visit_type_code',
    `LIMIT ${SUMMARY_LIMIT}`,
  ].join('\n');
}

/**
 * Distinct visits per (month × visit type) across all services.
 *
 * A visit that carries two telemedicine codes appears once per service in
 * {@link buildTelemedMonthlySql}; this keeps the all-services total exact.
 */
export function buildTelemedMonthlyTotalSql(): string {
  return [
    'SELECT',
    '  EXTRACT(YEAR FROM o.vstdate)  AS yr,',
    '  EXTRACT(MONTH FROM o.vstdate) AS mon,',
    '  v.ovstist AS visit_type_code,',
    `  COUNT(DISTINCT ${VISIT_KEY}) AS visit_count`,
    ...TELMED_FROM,
    'GROUP BY EXTRACT(YEAR FROM o.vstdate), EXTRACT(MONTH FROM o.vstdate), v.ovstist',
    'ORDER BY yr, mon, visit_type_code',
    `LIMIT ${SUMMARY_LIMIT}`,
  ].join('\n');
}

/** Upper bound on visit-type lookup rows; the table holds a few dozen at most. */
const VISIT_TYPE_LIMIT = 500;

/**
 * The visit-type lookup, kept out of the summary queries: names are a nicety,
 * so a site whose lookup differs still gets its numbers. `*` avoids depending
 * on column names beyond the code and `name`.
 */
export function buildVisitTypeNamesSql(): string {
  return `SELECT * FROM ovstist LIMIT ${VISIT_TYPE_LIMIT}`;
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/**
 * A result as long as the LIMIT was probably cut short; summing it would
 * under-report silently, so refuse it instead.
 */
function assertComplete(data: readonly unknown[]): void {
  if (data.length >= SUMMARY_LIMIT) {
    throw new Error(
      `ข้อมูลมากเกินกว่าที่ดึงได้ในครั้งเดียว (${SUMMARY_LIMIT.toLocaleString('th-TH')} แถว) ` +
        'ตัวเลขจึงอาจไม่ครบ กรุณาแจ้งผู้ดูแลระบบ',
    );
  }
}

/**
 * Normalise raw monthly summary rows.
 *
 * Rows without a valid month or an icode are dropped rather than guessed at.
 */
export function normalizeMonthlyRows(
  data: readonly unknown[] | undefined,
): MonthlyServiceRow[] {
  if (!data) return [];
  assertComplete(data);

  const rows: MonthlyServiceRow[] = [];
  for (const entry of data) {
    const raw = entry as Record<string, unknown>;
    const month = toMonth(raw);
    const icode = str(raw.local_icode);
    if (month === '' || icode === '') continue;

    rows.push({
      month,
      standardCode: str(raw.standard_code),
      icode,
      serviceName: str(raw.service_name),
      visitTypeCode: str(raw.visit_type_code),
      itemRows: num(raw.item_rows),
      visits: num(raw.visit_count),
      qty: num(raw.total_qty),
      amount: num(raw.total_amount),
      zeroPriceRows: num(raw.zero_price_rows),
      noVnRows: num(raw.no_vn_rows),
    });
  }
  return rows;
}

/** Normalise raw per-(month × visit type) distinct-visit totals. */
export function normalizeMonthlyTotals(
  data: readonly unknown[] | undefined,
): MonthlyTotalRow[] {
  if (!data) return [];
  assertComplete(data);

  const rows: MonthlyTotalRow[] = [];
  for (const entry of data) {
    const raw = entry as Record<string, unknown>;
    const month = toMonth(raw);
    if (month === '') continue;
    rows.push({ month, visitTypeCode: str(raw.visit_type_code), visits: num(raw.visit_count) });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Series
// ---------------------------------------------------------------------------

/**
 * The services present in `rows`, one per icode, ordered by icode so each
 * keeps its position (and colour) across fiscal years.
 */
export function deriveServices(rows: readonly MonthlyServiceRow[]): TelemedService[] {
  const byIcode = new Map<string, TelemedService>();
  for (const r of rows) {
    const known = byIcode.get(r.icode);
    if (known && known.name !== '') continue;
    byIcode.set(r.icode, { icode: r.icode, name: r.serviceName, standardCode: r.standardCode });
  }
  return [...byIcode.values()]
    .map((s) => (s.name === '' ? { ...s, name: `รหัส ${s.icode}` } : s))
    .sort((a, b) => a.icode.localeCompare(b.icode));
}

/**
 * The twelve months of `fiscalYear`, each broken down by service.
 *
 * Months with no rows, and services with no rows in a month, are present with
 * zeros, so charts keep a fixed axis and both fiscal years share one set of
 * keys. The month total's visit count comes from `totals` when available,
 * since summing per-service visits can double-count a visit billed under two
 * codes.
 */
export function buildFiscalSeries(
  rows: readonly MonthlyServiceRow[],
  totals: readonly MonthlyTotalRow[],
  services: readonly TelemedService[],
  fiscalYear: number,
  today: Date,
): FiscalMonthPoint[] {
  const current = format(today, 'yyyy-MM');
  // Each visit has one visit type, so the types add up to the month exactly.
  const totalByMonth = new Map<string, number>();
  for (const t of totals) {
    totalByMonth.set(t.month, (totalByMonth.get(t.month) ?? 0) + t.visits);
  }

  const points = fiscalMonths(fiscalYear).map<FiscalMonthPoint>((month) => ({
    month,
    label: fiscalMonthLabel(month),
    isFuture: month > current,
    services: emptyServices(services),
    total: emptyMetrics(),
  }));
  const pointByMonth = new Map(points.map((p) => [p.month, p]));

  for (const r of rows) {
    const point = pointByMonth.get(r.month);
    const target = point?.services[r.icode];
    if (!point || !target) continue;
    addInto(target, r);
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
  const summary: SeriesSummary = { services: {}, total: emptyMetrics() };
  for (const point of series.slice(0, monthCount)) {
    for (const [icode, metrics] of Object.entries(point.services)) {
      summary.services[icode] ??= emptyMetrics();
      addInto(summary.services[icode], metrics);
    }
    addInto(summary.total, point.total);
  }
  return summary;
}

// ---------------------------------------------------------------------------
// Visit types
// ---------------------------------------------------------------------------

/** Visit-type code → name, from the lookup table. */
export function normalizeVisitTypeNames(data: readonly unknown[] | undefined): Map<string, string> {
  const names = new Map<string, string>();
  for (const entry of data ?? []) {
    const raw = entry as Record<string, unknown>;
    const code = str(raw.ovstist);
    const name = str(raw.name);
    if (code !== '' && name !== '') names.set(code, name);
  }
  return names;
}

/** Display name of a visit type; `''` is a line with no visit record. */
export function visitTypeLabel(code: string, names: ReadonlyMap<string, string>): string {
  if (code === '') return 'ไม่ระบุ';
  return names.get(code) ?? `ประเภท ${code}`;
}

export interface VisitTypeShare {
  code: string;
  name: string;
  visits: number;
  amount: number;
  /** Percentage of the window's visits, 0–100. */
  share: number;
  /** Visits in the same months of the prior fiscal year. */
  previousVisits: number;
}

/**
 * Visits and amount per visit type for one service, or all services
 * ({@link TOTAL_KEY}), over the first `monthCount` months of `fiscalYear` —
 * the same window the cards compare — with the prior year's visits alongside.
 *
 * All-services visits come from `totals`, so a visit billed under two codes
 * counts once; amounts always come from the service rows.
 */
export function summarizeByVisitType(
  rows: readonly MonthlyServiceRow[],
  totals: readonly MonthlyTotalRow[],
  selection: string,
  fiscalYear: number,
  monthCount: number,
  names: ReadonlyMap<string, string>,
): VisitTypeShare[] {
  const window = new Set(fiscalMonths(fiscalYear).slice(0, monthCount));
  const previousWindow = new Set(fiscalMonths(fiscalYear - 1).slice(0, monthCount));
  const isTotal = selection === TOTAL_KEY;

  const byCode = new Map<string, { visits: number; amount: number; previousVisits: number }>();
  const entry = (code: string) => {
    let found = byCode.get(code);
    if (!found) {
      found = { visits: 0, amount: 0, previousVisits: 0 };
      byCode.set(code, found);
    }
    return found;
  };

  for (const r of rows) {
    if (!isTotal && r.icode !== selection) continue;
    if (window.has(r.month)) {
      const e = entry(r.visitTypeCode);
      e.amount += r.amount;
      if (!isTotal) e.visits += r.visits;
    } else if (!isTotal && previousWindow.has(r.month)) {
      entry(r.visitTypeCode).previousVisits += r.visits;
    }
  }

  if (isTotal) {
    for (const t of totals) {
      if (window.has(t.month)) entry(t.visitTypeCode).visits += t.visits;
      else if (previousWindow.has(t.month)) entry(t.visitTypeCode).previousVisits += t.visits;
    }
  }

  const windowVisits = [...byCode.values()].reduce((sum, e) => sum + e.visits, 0);
  return [...byCode.entries()]
    .filter(([, e]) => e.visits > 0 || e.amount > 0 || e.previousVisits > 0)
    .map(([code, e]) => ({
      code,
      name: visitTypeLabel(code, names),
      ...e,
      share: windowVisits > 0 ? (e.visits / windowVisits) * 100 : 0,
    }))
    .sort((a, b) => b.visits - a.visits || a.code.localeCompare(b.code));
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

/** The fiscal year's summary rows, ordered by month, icode, then visit type. */
export function selectFiscalYearRows(
  rows: readonly MonthlyServiceRow[],
  fiscalYear: number,
): MonthlyServiceRow[] {
  const months = new Set(fiscalMonths(fiscalYear));
  return rows
    .filter((r) => months.has(r.month))
    .sort(
      (a, b) =>
        a.month.localeCompare(b.month) ||
        a.icode.localeCompare(b.icode) ||
        a.visitTypeCode.localeCompare(b.visitTypeCode),
    );
}

/** Columns emitted by {@link toMonthlyCsv}, matching the summary query. */
const CSV_COLUMNS: ReadonlyArray<{
  header: string;
  get: (r: MonthlyServiceRow, names: ReadonlyMap<string, string>) => string;
}> = [
  { header: 'year_month', get: (r) => r.month },
  { header: 'standard_code', get: (r) => r.standardCode },
  { header: 'local_icode', get: (r) => r.icode },
  { header: 'service_name', get: (r) => r.serviceName },
  { header: 'visit_type_code', get: (r) => r.visitTypeCode },
  { header: 'visit_type_name', get: (r, names) => visitTypeLabel(r.visitTypeCode, names) },
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

/** The fiscal year's summary rows as CSV, one line per month × service × visit type. */
export function toMonthlyCsv(
  rows: readonly MonthlyServiceRow[],
  fiscalYear: number,
  visitTypeNames: ReadonlyMap<string, string>,
): string {
  const lines = [CSV_COLUMNS.map((c) => c.header).join(',')];
  for (const r of selectFiscalYearRows(rows, fiscalYear)) {
    lines.push(CSV_COLUMNS.map((c) => csvField(c.get(r, visitTypeNames))).join(','));
  }
  return lines.join('\n');
}

/** `telemed-fy2569.csv` */
export function csvFilename(fiscalYear: number): string {
  return `telemed-fy${fiscalYear}.csv`;
}
