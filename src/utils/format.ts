// =============================================================================
// Telemedicine Dashboard - Presentation formatters
//
// Thai-locale display helpers. Kept separate from `dateUtils` (which stays
// Gregorian and is already covered by its own tests) so nothing regresses.
//
// Buddhist era: Thai fiscal and clinical calendars are BE, which is CE + 543.
// Every user-facing date goes through here.
// =============================================================================

import { format, parseISO } from 'date-fns';
import { th } from 'date-fns/locale';

/** CE → BE offset. */
export const BUDDHIST_ERA_OFFSET = 543;

/** Shown wherever a figure has no data to divide by. */
export const NO_VALUE = '—';

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

/**
 * Group a number with thousands separators.
 *
 * @param fractionDigits - Decimals to keep; defaults to 0 for counts.
 */
export function formatNumber(value: number, fractionDigits = 0): string {
  if (!Number.isFinite(value)) return NO_VALUE;
  return value.toLocaleString('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

/** Group a money amount, appending the Thai baht unit. */
export function formatBaht(value: number, fractionDigits = 0): string {
  if (!Number.isFinite(value)) return NO_VALUE;
  return `${formatNumber(value, fractionDigits)} บาท`;
}

/**
 * Render a share as a percentage.
 *
 * Keeps one decimal, but drops `.0` so whole numbers read cleanly.
 */
export function formatPercent(value: number, fractionDigits = 1): string {
  if (!Number.isFinite(value)) return NO_VALUE;
  const rounded = Number(value.toFixed(fractionDigits));
  return `${formatNumber(rounded, Number.isInteger(rounded) ? 0 : fractionDigits)}%`;
}

/**
 * Render a signed change, e.g. `+12.5%` / `-3%`.
 *
 * Returns {@link NO_VALUE} for a null change (no baseline to compare against).
 */
export function formatChange(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return NO_VALUE;
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatPercent(value)}`;
}

// ---------------------------------------------------------------------------
// Thai dates (Buddhist era)
// ---------------------------------------------------------------------------

/** `2569` — the Buddhist year for a CE year. */
export function toBuddhistYear(ceYear: number): number {
  return ceYear + BUDDHIST_ERA_OFFSET;
}

/**
 * `2026-09-30` → `30 ก.ย. 2569`.
 *
 * Accepts a bare date or a full ISO timestamp; only the date portion is used.
 */
export function formatThaiDate(value: string | Date): string {
  const date = toDate(value);
  if (!date) return NO_VALUE;
  return `${format(date, 'd MMM', { locale: th })} ${toBuddhistYear(date.getFullYear())}`;
}

/** `2026-09-30` → `30 กันยายน 2569` (full month name). */
export function formatThaiDateLong(value: string | Date): string {
  const date = toDate(value);
  if (!date) return NO_VALUE;
  return `${format(date, 'd MMMM', { locale: th })} ${toBuddhistYear(date.getFullYear())}`;
}

/** `2026-09` → `ก.ย. 2569`. */
export function formatThaiMonth(value: string): string {
  const date = toDate(`${value}-01`);
  if (!date) return NO_VALUE;
  return `${format(date, 'MMM', { locale: th })} ${toBuddhistYear(date.getFullYear())}`;
}

/** `09:15:00` → `09:15`. */
export function formatTime(value: string): string {
  const parts = value.split(':');
  if (parts.length < 2) return value === '' ? NO_VALUE : value;
  return `${parts[0]}:${parts[1]}`;
}

/**
 * A short range label for headers and exports, e.g. `30 ก.ย. – 30 ก.ย. 2569`.
 */
export function formatThaiRange(start: string, end: string): string {
  if (start === end) return formatThaiDateLong(start);
  return `${formatThaiDate(start)} – ${formatThaiDateLong(end)}`;
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

/** Parse a `yyyy-MM-dd` / ISO string or pass a `Date` through. */
function toDate(value: string | Date): Date | null {
  const date = typeof value === 'string' ? parseISO(value.slice(0, 10)) : value;
  return Number.isNaN(date.getTime()) ? null : date;
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

/**
 * Trigger a client-side file download. No-op outside a browser (SSR/tests).
 *
 * The BOM keeps Excel from mangling Thai text.
 */
export function downloadTextFile(
  filename: string,
  contents: string,
  mimeType = 'text/csv;charset=utf-8',
): void {
  if (typeof document === 'undefined') return;

  const blob = new Blob([`\uFEFF${contents}`], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
