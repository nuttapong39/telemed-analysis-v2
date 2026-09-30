// =============================================================================
// Telemedicine Dashboard - shared presentation primitives
//
// Cards, the fiscal-year picker, the change badge and the
// loading/error/empty trio. Design brief: bright white surfaces on a
// white-to-smoke gradient, teal accent, generous whitespace, soft shadows and
// a pointer cursor on everything interactive.
// =============================================================================

import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, CalendarRange, Inbox, RefreshCw, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatChange } from '@/utils/format';

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

interface SectionCardProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  /** Rendered top-right, e.g. a toggle or export button. */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function SectionCard({
  title,
  description,
  icon,
  aside,
  children,
  className,
}: SectionCardProps) {
  return (
    <section className={cn('surface animate-rise-in p-5 sm:p-6', className)}>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          {icon && (
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-primary">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
            {description && (
              <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>
            )}
          </div>
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </header>

      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Change badge
// ---------------------------------------------------------------------------

/** Signed +/- pill for a year-over-year change. */
export function ChangeBadge({ change }: { change: number | null }) {
  if (change === null) {
    return <span className="text-xs text-muted-foreground">ไม่มีข้อมูลปีงบก่อน</span>;
  }

  const up = change > 0;
  const flat = change === 0;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums',
        flat && 'bg-muted text-muted-foreground',
        !flat && up && 'bg-emerald-50 text-emerald-700',
        !flat && !up && 'bg-rose-50 text-rose-700',
      )}
    >
      {!flat && (up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      <span>{formatChange(change)}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Fiscal-year picker
// ---------------------------------------------------------------------------

interface FiscalYearSelectProps {
  value: number;
  options: readonly number[];
  onChange: (fiscalYear: number) => void;
  disabled?: boolean;
}

export function FiscalYearSelect({ value, options, onChange, disabled }: FiscalYearSelectProps) {
  return (
    <label className="relative inline-flex items-center gap-2 rounded-xl border border-border bg-card py-1.5 pl-3 pr-2 text-sm shadow-[0_1px_2px_rgb(15_23_42/0.04)] transition-colors focus-within:border-primary/40 hover:border-primary/30">
      <CalendarRange className="h-4 w-4 text-primary" aria-hidden="true" />
      <select
        aria-label="ปีงบประมาณ"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="cursor-pointer appearance-none bg-transparent pr-5 font-medium text-foreground outline-none disabled:cursor-not-allowed"
      >
        {options.map((fy) => (
          <option key={fy} value={fy}>
            ปีงบประมาณ {fy}
          </option>
        ))}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 12 12"
        className="pointer-events-none absolute right-2.5 h-3 w-3 text-muted-foreground"
      >
        <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </label>
  );
}

/** Pill-shaped two-way toggle, e.g. Visit / ยอดเงิน. */
export function SegmentedToggle<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex items-center gap-0.5 rounded-full border border-border bg-muted/60 p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors',
            value === o.value
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Quiet outline button used in the toolbar. */
export function ToolbarButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground',
        'shadow-[0_1px_2px_rgb(15_23_42/0.04)] transition-colors hover:border-primary/30 hover:text-primary',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:text-foreground',
        className,
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Loading / error / empty
// ---------------------------------------------------------------------------

export function LoadingState({ message = 'กำลังโหลดข้อมูล...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14" role="status">
      <span className="h-7 w-7 animate-spin rounded-full border-2 border-accent border-t-primary" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-rose-50 text-rose-600">
        <TriangleAlert className="h-5 w-5" />
      </span>
      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">{message}</p>
      {onRetry && (
        <ToolbarButton onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" />
          ลองใหม่
        </ToolbarButton>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  message,
  hint,
  action,
}: {
  title: string;
  message: string;
  hint?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-accent text-primary">
        <Inbox className="h-5 w-5" />
      </span>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">{message}</p>
      {hint && <p className="text-xs text-muted-foreground/80">{hint}</p>}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-1 cursor-pointer rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
