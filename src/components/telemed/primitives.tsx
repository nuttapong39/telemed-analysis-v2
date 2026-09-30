// =============================================================================
// Telemedicine Dashboard - shared presentation primitives
//
// Cards, filters, sortable-table plumbing and the loading/error/empty trio.
// Design brief: white, minimal, generous whitespace, soft shadows, no harsh
// colour, faint background patterns that sit behind the text without competing
// with it, and a pointer cursor on everything interactive.
// =============================================================================

import { useId, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  ChevronsUpDown,
  Inbox,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react';
import { format, startOfDay, startOfMonth, startOfYear, subDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { formatChange, formatThaiDate } from '@/utils/format';

// ---------------------------------------------------------------------------
// Date-range presets
// ---------------------------------------------------------------------------

export type RangePresetId = 'today' | '7d' | '30d' | 'month' | 'year' | 'custom';

export interface DateRange {
  start: string;
  end: string;
}

interface RangePreset {
  id: RangePresetId;
  label: string;
}

export const RANGE_PRESETS: readonly RangePreset[] = [
  { id: 'today', label: 'วันนี้' },
  { id: '7d', label: '7 วันล่าสุด' },
  { id: '30d', label: '30 วันล่าสุด' },
  { id: 'month', label: 'เดือนนี้' },
  { id: 'year', label: 'ปีนี้' },
  { id: 'custom', label: 'กำหนดเอง' },
];

/** `yyyy-MM-dd` for a `Date`, in local time (not UTC-shifted). */
function isoDay(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/** Resolve a preset into concrete bounds. `custom` keeps the caller's range. */
export function resolvePreset(id: RangePresetId, current?: DateRange): DateRange {
  const today = new Date();
  switch (id) {
    case 'today':
      return { start: isoDay(startOfDay(today)), end: isoDay(today) };
    case '7d':
      return { start: isoDay(subDays(today, 6)), end: isoDay(today) };
    case '30d':
      return { start: isoDay(subDays(today, 29)), end: isoDay(today) };
    case 'month':
      return { start: isoDay(startOfMonth(today)), end: isoDay(today) };
    case 'year':
      return { start: isoDay(startOfYear(today)), end: isoDay(today) };
    case 'custom':
      return current ?? { start: isoDay(subDays(today, 29)), end: isoDay(today) };
  }
}

// ---------------------------------------------------------------------------
// Background patterns
//
// Faint enough to sit behind text. Each instance gets its own pattern id so two
// cards on the same page cannot collide.
// ---------------------------------------------------------------------------

export type PatternName = 'grid' | 'waves' | 'dots' | 'pulse';

interface CardPatternProps {
  name: PatternName;
  className?: string;
}

export function CardPattern({ name, className }: CardPatternProps) {
  const rawId = useId();
  const id = `pat-${rawId.replace(/:/g, '')}-${name}`;
  const tile = name === 'waves' || name === 'pulse' ? { w: 120, h: 60 } : { w: 28, h: 28 };

  return (
    <svg
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-0 h-full w-full text-primary',
        className,
      )}
    >
      <defs>
        <pattern
          id={id}
          width={tile.w}
          height={tile.h}
          patternUnits="userSpaceOnUse"
        >
          {name === 'grid' && (
            <path
              d="M 28 0 L 0 0 0 28"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.6"
              opacity="0.09"
            />
          )}
          {name === 'dots' && (
            <circle cx="2" cy="2" r="1.1" fill="currentColor" opacity="0.1" />
          )}
          {name === 'waves' && (
            <path
              d="M0 30 Q30 10 60 30 T120 30"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              opacity="0.09"
            />
          )}
          {name === 'pulse' && (
            <path
              d="M0 40 L30 40 L38 18 L46 52 L54 40 L120 40"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.1"
              opacity="0.1"
            />
          )}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

interface SectionCardProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  pattern?: PatternName;
  /** Rendered top-right, e.g. a range label or export button. */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Makes the whole card a hover/click target for a drill-down. */
  onClick?: () => void;
}

export function SectionCard({
  title,
  description,
  icon,
  pattern = 'grid',
  aside,
  children,
  className,
  onClick,
}: SectionCardProps) {
  const interactive = Boolean(onClick);

  return (
    <section
      {...(interactive
        ? {
            role: 'button',
            tabIndex: 0,
            onClick,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.();
              }
            },
          }
        : {})}
      className={cn(
        'relative isolate overflow-hidden rounded-2xl border border-border/60 bg-card',
        'shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-12px_rgba(16,24,40,0.10)]',
        'transition-shadow duration-200',
        interactive &&
          'cursor-pointer hover:shadow-[0_2px_4px_rgba(16,24,40,0.05),0_16px_40px_-16px_rgba(16,24,40,0.16)]',
        className,
      )}
    >
      <CardPattern name={pattern} />

      <div className="relative p-5 sm:p-6">
        <header className="mb-5 flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            {icon && (
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/5 text-primary/70">
                {icon}
              </span>
            )}
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold tracking-tight text-foreground">
                {title}
              </h2>
              {description && (
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {description}
                </p>
              )}
            </div>
          </div>
          {aside && <div className="shrink-0">{aside}</div>}
        </header>

        {children}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Stat tile (hero columns)
// ---------------------------------------------------------------------------

interface StatTileProps {
  label: string;
  value: string;
  unit?: string;
  sub?: ReactNode;
  icon: ReactNode;
  onClick?: () => void;
  tone?: 'default' | 'positive' | 'negative';
}

export function StatTile({
  label,
  value,
  unit,
  sub,
  icon,
  onClick,
  tone = 'default',
}: StatTileProps) {
  const valueTone =
    tone === 'positive'
      ? 'text-emerald-600'
      : tone === 'negative'
        ? 'text-rose-600'
        : 'text-foreground';

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative w-full cursor-pointer rounded-xl px-4 py-4 text-left',
        'transition-colors duration-200 hover:bg-muted/40',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      )}
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="text-primary/60">{icon}</span>
        <span className="text-xs font-medium tracking-wide">{label}</span>
      </div>

      <div className="mt-3 flex items-baseline gap-1.5">
        <span
          className={cn(
            'text-3xl font-semibold tabular-nums tracking-tight sm:text-4xl',
            valueTone,
          )}
        >
          {value}
        </span>
        {unit && (
          <span className="text-sm font-medium text-muted-foreground">{unit}</span>
        )}
      </div>

      {sub && <div className="mt-2 text-sm text-muted-foreground">{sub}</div>}
    </button>
  );
}

/** Small +/- badge for a period-over-period change. */
export function ChangeBadge({ change }: { change: number | null }) {
  if (change === null) {
    return <span className="text-xs text-muted-foreground">ไม่มีข้อมูลช่วงก่อน</span>;
  }

  const up = change > 0;
  const flat = change === 0;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums',
        flat && 'bg-muted text-muted-foreground',
        !flat && up && 'bg-emerald-50 text-emerald-700',
        !flat && !up && 'bg-rose-50 text-rose-700',
      )}
    >
      {!flat &&
        (up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      {formatChange(change)}
      <span className="font-normal opacity-70">เทียบช่วงก่อน</span>
    </span>
  );
}

/** Horizontal share bar used by the payer and service breakdowns. */
export function ProportionBar({
  percent,
  className,
}: {
  percent: number;
  className?: string;
}) {
  const width = Math.max(0, Math.min(100, percent));

  return (
    <div
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
      role="presentation"
    >
      <div
        className="h-full rounded-full bg-primary/45 transition-[width] duration-500"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading / error / empty
// ---------------------------------------------------------------------------

export function LoadingState({ message = 'กำลังโหลดข้อมูล...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12" role="status">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary/60" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <span className="grid h-10 w-10 place-items-center rounded-full bg-rose-50 text-rose-600">
        <TriangleAlert className="h-5 w-5" />
      </span>
      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          ลองใหม่
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  message,
  hint,
  onReset,
}: {
  title: string;
  message: string;
  hint?: string;
  onReset?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <span className="grid h-10 w-10 place-items-center rounded-full bg-muted text-muted-foreground">
        <Inbox className="h-5 w-5" />
      </span>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">{message}</p>
      {hint && <p className="text-xs text-muted-foreground/80">{hint}</p>}
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          className="mt-1 cursor-pointer rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
        >
          ล้างตัวกรอง
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Range filter
// ---------------------------------------------------------------------------

interface RangeFilterProps {
  preset: RangePresetId;
  range: DateRange;
  onPresetChange: (preset: RangePresetId) => void;
  onRangeChange: (range: DateRange) => void;
}

export function RangeFilter({
  preset,
  range,
  onPresetChange,
  onRangeChange,
}: RangeFilterProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        className="flex flex-wrap items-center gap-1 rounded-xl border border-border/60 bg-muted/40 p-1"
        role="group"
        aria-label="ช่วงวันที่"
      >
        {RANGE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPresetChange(p.id)}
            aria-pressed={preset === p.id}
            className={cn(
              'cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              preset === p.id
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {preset === 'custom' && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card px-3 py-1.5">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <input
            type="date"
            value={range.start}
            max={range.end}
            aria-label="วันที่เริ่มต้น"
            onChange={(e) => onRangeChange({ ...range, start: e.target.value })}
            className="cursor-pointer bg-transparent text-sm tabular-nums outline-none"
          />
          <span className="text-muted-foreground">–</span>
          <input
            type="date"
            value={range.end}
            min={range.start}
            aria-label="วันที่สิ้นสุด"
            onChange={(e) => onRangeChange({ ...range, end: e.target.value })}
            className="cursor-pointer bg-transparent text-sm tabular-nums outline-none"
          />
        </div>
      )}

      {preset !== 'custom' && (
        <span className="text-sm text-muted-foreground">
          {formatThaiDate(range.start)} – {formatThaiDate(range.end)}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sortable table plumbing
//
// Clicking a header cycles desc → asc → unsorted, so a third click restores the
// server order instead of trapping the user in an accidental sort.
// ---------------------------------------------------------------------------

export type SortDirection = 'asc' | 'desc';
export interface SortState<K extends string> {
  key: K;
  direction: SortDirection;
}

export function useTableSort<K extends string>(
  initialKey: K,
  initialDirection: SortDirection = 'desc',
) {
  const [sort, setSort] = useState<SortState<K> | null>({
    key: initialKey,
    direction: initialDirection,
  });

  const toggle = (key: K) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, direction: 'desc' };
      if (prev.direction === 'desc') return { key, direction: 'asc' };
      return null;
    });
  };

  const reset = () => setSort({ key: initialKey, direction: initialDirection });

  /** Sort a copy of `rows` by the active column; unsorted keeps input order. */
  const apply = <T,>(
    rows: readonly T[],
    accessors: Record<K, (row: T) => number | string>,
  ): T[] => {
    if (!sort) return [...rows];
    const pick = accessors[sort.key];
    if (!pick) return [...rows];
    const factor = sort.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = pick(a);
      const bv = pick(b);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor;
      return String(av).localeCompare(String(bv), 'th') * factor;
    });
  };

  return { sort, toggle, reset, apply };
}

export function SortableHeader<K extends string>({
  label,
  columnKey,
  sort,
  onToggle,
  align = 'right',
}: {
  label: string;
  columnKey: K;
  sort: SortState<K> | null;
  onToggle: (key: K) => void;
  align?: 'left' | 'right';
}) {
  const active = sort?.key === columnKey;
  const direction = active ? sort.direction : null;

  return (
    <th
      scope="col"
      className={cn(
        'px-4 py-2.5 font-medium',
        align === 'right' ? 'text-right' : 'text-left',
      )}
    >
      <button
        type="button"
        onClick={() => onToggle(columnKey)}
        title={
          direction === 'desc'
            ? 'คลิกเพื่อเรียงจากน้อยไปมาก'
            : direction === 'asc'
              ? 'คลิกเพื่อล้างการเรียง'
              : 'คลิกเพื่อเรียงจากมากไปน้อย'
        }
        className={cn(
          'inline-flex cursor-pointer items-center gap-1 rounded transition-colors hover:text-foreground',
          align === 'right' && 'flex-row-reverse',
          active ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        <span>{label}</span>
        {direction === 'desc' && <ArrowDown className="h-3 w-3" />}
        {direction === 'asc' && <ArrowUp className="h-3 w-3" />}
        {!active && <ChevronsUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </th>
  );
}

/** Stable string key for a range, handy as a memo dependency. */
export function useRangeLabel(range: DateRange): string {
  return useMemo(() => `${range.start}..${range.end}`, [range.start, range.end]);
}
