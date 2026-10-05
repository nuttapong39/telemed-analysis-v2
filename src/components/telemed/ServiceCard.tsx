// =============================================================================
// Telemedicine Dashboard - service summary card
//
// One card per service (and one for all services): visits and amount for the
// selected fiscal year, each with its change against the prior fiscal year.
// The whole card opens the drill-down modal.
// =============================================================================

import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ChangeBadge } from '@/components/telemed/primitives';
import type { ServiceVisual } from '@/components/telemed/serviceTheme';
import { formatNumber } from '@/utils/format';

interface ServiceCardProps {
  visual: ServiceVisual;
  /** The all-services card: larger figures and a tinted background. */
  featured?: boolean;
  label: string;
  description: string;
  visits: number;
  amount: number;
  visitChange: number | null;
  amountChange: number | null;
  /** e.g. `เทียบปีงบ 2568` or `เทียบ ต.ค.–ธ.ค. ปีงบ 2568`. */
  compareLabel: string;
  onClick: () => void;
  className?: string;
}

export function ServiceCard({
  visual,
  featured = false,
  label,
  description,
  visits,
  amount,
  visitChange,
  amountChange,
  compareLabel,
  onClick,
  className,
}: ServiceCardProps) {
  const Icon = visual.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label} — ดูรายละเอียด`}
      className={cn(
        'surface surface-interactive group relative flex w-full flex-col overflow-hidden p-5 text-left',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        featured && 'bg-linear-to-br from-white via-white to-teal-50/70',
        className,
      )}
    >
      {/* Soft colour wash in the corner, echoing the service colour. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-[0.08] blur-2xl"
        style={{ background: visual.color }}
      />

      <span className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-center gap-3">
          <span className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-2xl', visual.tile)}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span
              title={label}
              className="block truncate text-sm font-semibold tracking-tight text-foreground"
            >
              {label}
            </span>
            <span className="block truncate text-xs text-muted-foreground">{description}</span>
          </span>
        </span>
        <ChevronRight
          aria-hidden="true"
          className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
        />
      </span>

      {/* Spans only: a <button> may hold phrasing content, not <dl>/<div>. */}
      <span className="mt-5 grid grid-cols-2 gap-4">
        <Figure label="Visit ทั้งหมด" value={visits} change={visitChange} large={featured} />
        <Figure label="จำนวนเงิน (บาท)" value={amount} change={amountChange} large={featured} />
      </span>

      <span className="mt-4 block border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
        {compareLabel}
      </span>
    </button>
  );
}

function Figure({
  label,
  value,
  change,
  large,
}: {
  label: string;
  value: number;
  change: number | null;
  large: boolean;
}) {
  return (
    <span className="block min-w-0">
      <span className="block text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          'mt-1 block truncate font-semibold tabular-nums tracking-tight text-foreground',
          large ? 'text-3xl' : 'text-2xl',
        )}
      >
        {formatNumber(value)}
      </span>
      <span className="mt-1.5 block">
        <ChangeBadge change={change} />
      </span>
    </span>
  );
}
