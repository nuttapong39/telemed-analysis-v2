// =============================================================================
// Telemedicine Dashboard - Query + Aggregation Service
//
// Two responsibilities, deliberately kept apart:
//   1. Build the one SQL statement that pulls the raw telemedicine visit lines
//      for a date window.
//   2. Reduce those rows, entirely client-side, into everything the dashboard
//      renders — totals, monthly series, payer mix, service mix, deltas, CSV.
//
// All reduction functions are pure so they are cheap to unit-test and safe to
// re-run on every filter change without another round trip.
// =============================================================================

import {
  format,
  parseISO,
  startOfMonth,
  subMonths,
  subDays,
  differenceInCalendarDays,
} from 'date-fns';
import { th } from 'date-fns/locale';
import type { SqlParams } from '@/types';

// ---------------------------------------------------------------------------
// Domain constants
// ---------------------------------------------------------------------------

/** The three HOSxP `nondrugitems.icode` values that make up telemedicine. */
export const TELEMED_ICODES = ['3002416', '3002487', '3002488'] as const;

/** The telehealth service whose cost trend gets its own chart. */
export const TELEHEALTH_ICODE = '3002416';

/** How many months of history the charts always want to show. */
export const TREND_MONTHS = 12;

/** Shown when a visit has no payer type recorded. */
const UNKNOWN_PTTYPE = 'ไม่ระบุสิทธิ';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One raw row as delivered by `/api/sql` (snake_case, stringly-typed). */
export interface TelemedRawRow {
  vn?: unknown;
  hn?: unknown;
  vstdate?: unknown;
  vsttime?: unknown;
  icode?: unknown;
  service_name?: unknown;
  pttype_name?: unknown;
  sum_price?: unknown;
  pname?: unknown;
  fname?: unknown;
  lname?: unknown;
}

/** A normalised visit line. */
export interface TelemedRow {
  vn: string;
  hn: string;
  /** `yyyy-MM-dd` */
  vstdate: string;
  vsttime: string;
  icode: string;
  serviceName: string;
  pttypeName: string;
  sumPrice: number;
  pname: string;
  fname: string;
  lname: string;
}

export interface MonthPoint {
  /** `yyyy-MM` — stable sort key. */
  month: string;
  /** Thai label, e.g. `ส.ค. 2569`. */
  label: string;
  visits: number;
  cost: number;
}

export interface PttypePoint {
  pttypeName: string;
  visits: number;
  cost: number;
  percent: number;
}

export interface ServicePoint {
  icode: string;
  serviceName: string;
  visits: number;
  cost: number;
  percent: number;
}

export interface FetchWindow {
  fetchStart: string;
  fetchEnd: string;
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

/** Keep only the calendar-date portion of a possibly-datetime value. */
function toIsoDate(value: unknown): string {
  const raw = str(value);
  if (raw === '') return '';
  // `2026-09-01T00:00:00.000Z` → `2026-09-01`
  return raw.slice(0, 10);
}

/** `2026-08` → `ส.ค. 2569` (Buddhist era). */
function monthLabel(month: string): string {
  const parsed = parseISO(`${month}-01`);
  const buddhistYear = parsed.getFullYear() + 543;
  return `${format(parsed, 'MMM', { locale: th })} ${buddhistYear}`;
}

// ---------------------------------------------------------------------------
// SQL construction
// ---------------------------------------------------------------------------

/**
 * The single query backing the whole dashboard.
 *
 * Returns one row per `opitemrece` line so the caller can sum cost exactly and
 * still collapse to distinct visits with {@link distinctVisits}. The date range
 * is bound as `:start_date` / `:end_date` — never interpolated.
 *
 * `pttype` and `nondrugitems` are LEFT JOINed so a visit whose payer or service
 * row is missing still contributes instead of vanishing from the totals.
 *
 * There is no void filter: this schema has no `ovst.void_staff`, and `ovstost`
 * only ever holds 99/98/NULL for these rows, so filtering on it changes
 * nothing. That was verified against the live database, not assumed.
 */
export function buildTelemedSql(): string {
  const icodes = TELEMED_ICODES.map((code) => `'${code}'`).join(', ');

  return [
    'SELECT',
    '  oi.vn          AS vn,',
    '  o.hn           AS hn,',
    '  o.vstdate      AS vstdate,',
    '  o.vsttime      AS vsttime,',
    '  oi.icode       AS icode,',
    '  n.name         AS service_name,',
    '  pt.name        AS pttype_name,',
    '  oi.sum_price   AS sum_price,',
    '  p.pname        AS pname,',
    '  p.fname        AS fname,',
    '  p.lname        AS lname',
    'FROM opitemrece oi',
    'JOIN ovst o        ON o.vn = oi.vn',
    'JOIN patient p     ON p.hn = o.hn',
    'LEFT JOIN nondrugitems n ON n.icode = oi.icode',
    'LEFT JOIN pttype pt      ON pt.pttype = o.pttype',
    `WHERE oi.icode IN (${icodes})`,
    '  AND o.vstdate BETWEEN :start_date AND :end_date',
    'ORDER BY o.vstdate ASC, o.vsttime ASC, oi.vn ASC',
    'LIMIT 50000',
  ].join('\n');
}

/**
 * Bindings for {@link buildTelemedSql}.
 *
 * @param start - `yyyy-MM-dd`, inclusive.
 * @param end - `yyyy-MM-dd`, inclusive.
 */
export function buildTelemedParams(start: string, end: string): SqlParams {
  return {
    start_date: { value: start, value_type: 'date' },
    end_date: { value: end, value_type: 'date' },
  };
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/**
 * Normalise raw API rows into typed {@link TelemedRow}s.
 *
 * Rows without a `vn` are dropped — without one there is nothing to dedupe on.
 */
export function normalizeTelemedRows(
  data: readonly unknown[] | undefined,
): TelemedRow[] {
  if (!data || data.length === 0) return [];

  const rows: TelemedRow[] = [];
  for (const entry of data) {
    const raw = entry as TelemedRawRow;
    const vn = str(raw.vn);
    if (vn === '') continue;

    rows.push({
      vn,
      hn: str(raw.hn),
      vstdate: toIsoDate(raw.vstdate),
      vsttime: str(raw.vsttime),
      icode: str(raw.icode),
      serviceName: str(raw.service_name),
      pttypeName: str(raw.pttype_name),
      sumPrice: num(raw.sum_price),
      pname: str(raw.pname),
      fname: str(raw.fname),
      lname: str(raw.lname),
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Visit-level reduction
// ---------------------------------------------------------------------------

/**
 * Collapse item lines down to one row per visit, keeping the first seen.
 *
 * A `vn` can carry several `opitemrece` lines, so any headline "how many
 * visits" figure must go through here or it silently counts items instead.
 */
export function distinctVisits(rows: readonly TelemedRow[]): TelemedRow[] {
  const seen = new Set<string>();
  const visits: TelemedRow[] = [];
  for (const r of rows) {
    if (seen.has(r.vn)) continue;
    seen.add(r.vn);
    visits.push(r);
  }
  return visits;
}

/** Number of distinct visits. */
export function totalVisits(rows: readonly TelemedRow[]): number {
  return distinctVisits(rows).length;
}

/** Total cost across every item line. */
export function totalCost(rows: readonly TelemedRow[]): number {
  return rows.reduce((sum, r) => sum + r.sumPrice, 0);
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

/**
 * Monthly visit + cost series, ascending by month.
 *
 * @param costFilter - When given, only matching rows contribute to `cost`
 *   (used to isolate the telehealth service's cost trend). Visit counts always
 *   reflect every row, since a visit is a visit whichever service it billed.
 */
export function aggregateByMonth(
  rows: readonly TelemedRow[],
  costFilter?: (row: TelemedRow) => boolean,
): MonthPoint[] {
  const buckets = new Map<string, MonthPoint>();

  const bucketFor = (month: string): MonthPoint => {
    let bucket = buckets.get(month);
    if (!bucket) {
      bucket = { month, label: monthLabel(month), visits: 0, cost: 0 };
      buckets.set(month, bucket);
    }
    return bucket;
  };

  // A vn carries exactly one vstdate, so counting per vn is exact.
  const counted = new Set<string>();
  for (const r of rows) {
    if (r.vstdate === '') continue;
    const month = r.vstdate.slice(0, 7);
    bucketFor(month);
    if (counted.has(r.vn)) continue;
    counted.add(r.vn);
    bucketFor(month).visits += 1;
  }

  for (const r of rows) {
    if (r.vstdate === '') continue;
    if (costFilter && !costFilter(r)) continue;
    bucketFor(r.vstdate.slice(0, 7)).cost += r.sumPrice;
  }

  return [...buckets.values()].sort((a, b) => a.month.localeCompare(b.month));
}

/** Cost per visit, so payer/service points can attribute line totals. */
function costByVisit(rows: readonly TelemedRow[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const r of rows) {
    totals.set(r.vn, (totals.get(r.vn) ?? 0) + r.sumPrice);
  }
  return totals;
}

/** Payer mix, descending by visits, each with its share of total visits. */
export function aggregateByPttype(rows: readonly TelemedRow[]): PttypePoint[] {
  const visits = distinctVisits(rows);
  if (visits.length === 0) return [];

  const costs = costByVisit(rows);
  const buckets = new Map<string, PttypePoint>();

  for (const r of visits) {
    const name = r.pttypeName === '' ? UNKNOWN_PTTYPE : r.pttypeName;
    let bucket = buckets.get(name);
    if (!bucket) {
      bucket = { pttypeName: name, visits: 0, cost: 0, percent: 0 };
      buckets.set(name, bucket);
    }
    bucket.visits += 1;
    bucket.cost += costs.get(r.vn) ?? 0;
  }

  const total = visits.length;
  const points = [...buckets.values()];
  for (const p of points) p.percent = (p.visits / total) * 100;

  return points.sort(
    (a, b) => b.visits - a.visits || a.pttypeName.localeCompare(b.pttypeName),
  );
}

/** Service mix by icode, descending by visits, each with its share. */
export function aggregateByServiceType(rows: readonly TelemedRow[]): ServicePoint[] {
  const visits = distinctVisits(rows);
  if (visits.length === 0) return [];

  const costs = costByVisit(rows);
  const buckets = new Map<string, ServicePoint>();

  for (const r of visits) {
    let bucket = buckets.get(r.icode);
    if (!bucket) {
      bucket = {
        icode: r.icode,
        serviceName: r.serviceName === '' ? r.icode : r.serviceName,
        visits: 0,
        cost: 0,
        percent: 0,
      };
      buckets.set(r.icode, bucket);
    }
    bucket.visits += 1;
    bucket.cost += costs.get(r.vn) ?? 0;
  }

  const total = visits.length;
  const points = [...buckets.values()];
  for (const p of points) p.percent = (p.visits / total) * 100;

  return points.sort((a, b) => b.visits - a.visits || a.icode.localeCompare(b.icode));
}

// ---------------------------------------------------------------------------
// Range maths
// ---------------------------------------------------------------------------

/**
 * Widen the fetch window so the trend charts always have a full year of
 * context, even when the user picked a 7-day range.
 *
 * The requested start is never narrowed — only extended further back.
 */
export function buildFetchWindow(start: string, end: string): FetchWindow {
  const endDate = parseISO(end);
  const twelveMonthsBack = startOfMonth(
    subMonths(startOfMonth(endDate), TREND_MONTHS - 1),
  );

  const requestedStart = parseISO(start);
  const fetchStart =
    requestedStart < twelveMonthsBack ? requestedStart : twelveMonthsBack;

  return {
    fetchStart: format(fetchStart, 'yyyy-MM-dd'),
    fetchEnd: format(endDate, 'yyyy-MM-dd'),
  };
}

/**
 * The equal-length window immediately before `[start, end]`, used for the
 * "compared with previous period" deltas.
 */
export function shiftRange(
  start: string,
  end: string,
): { prevStart: string; prevEnd: string } {
  const startDate = parseISO(start);
  const endDate = parseISO(end);

  // Inclusive length: a same-day range is 1 day, not 0.
  const lengthDays = differenceInCalendarDays(endDate, startDate) + 1;
  const prevEnd = subDays(startDate, 1);
  const prevStart = subDays(prevEnd, lengthDays - 1);

  return {
    prevStart: format(prevStart, 'yyyy-MM-dd'),
    prevEnd: format(prevEnd, 'yyyy-MM-dd'),
  };
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
// Presentation helpers
// ---------------------------------------------------------------------------

/**
 * Human label for a visit's patient: `นาง สมศรี ใจดี (HN001)`.
 *
 * Falls back to an explicit placeholder so a blank name never renders as `()`.
 */
export function formatPatientLabel(row: TelemedRow): string {
  const name = [row.fname, row.lname].filter(Boolean).join(' ').trim();
  const withPrefix = [row.pname, name].filter(Boolean).join(' ').trim();

  if (withPrefix === '') {
    return row.hn === '' ? 'ไม่ระบุชื่อ' : `ไม่ระบุชื่อ (${row.hn})`;
  }
  return row.hn === '' ? withPrefix : `${withPrefix} (${row.hn})`;
}

/** Columns emitted by {@link toCsv}, in order. */
const CSV_COLUMNS: ReadonlyArray<{ header: string; get: (r: TelemedRow) => string }> =
  [
    { header: 'vn', get: (r) => r.vn },
    { header: 'hn', get: (r) => r.hn },
    { header: 'vstdate', get: (r) => r.vstdate },
    { header: 'vsttime', get: (r) => r.vsttime },
    { header: 'icode', get: (r) => r.icode },
    { header: 'service_name', get: (r) => r.serviceName },
    { header: 'pttype_name', get: (r) => r.pttypeName },
    { header: 'sum_price', get: (r) => String(r.sumPrice) },
    { header: 'patient', get: (r) => formatPatientLabel(r) },
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

/** Render rows as CSV, header first. */
export function toCsv(rows: readonly TelemedRow[]): string {
  const lines = [CSV_COLUMNS.map((c) => c.header).join(',')];
  for (const r of rows) {
    lines.push(CSV_COLUMNS.map((c) => csvField(c.get(r))).join(','));
  }
  return lines.join('\n');
}
