// =============================================================================
// Telemedicine Dashboard - drill-down detail modal
//
// Every KPI tile, chart mark and table row opens this. It answers the five
// questions a viewer asks of any number: how is it derived, what has it done
// over the last year, how does it compare with the period before, which records
// make it up, and can I take the raw data away.
//
// Deliberately not a second fetch — the dashboard already holds the full year
// of rows, so everything here is sliced client-side and the page never reloads.
// =============================================================================

import type { ReactNode } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Download, TrendingUp } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { ChangeBadge, ProportionBar } from '@/components/telemed/primitives';
import type { MonthPoint } from '@/services/telemed';
import {
  formatBaht,
  formatNumber,
  formatPercent,
  formatThaiDate,
  formatTime,
} from '@/utils/format';

/** One row in the "recent records" list. */
export interface DetailRecord {
  id: string;
  /** Primary line, e.g. the patient label. */
  primary: string;
  /** Secondary line, e.g. HN + service + payer. */
  secondary: string;
  /** Date shown on the right. */
  date: string;
  time?: string;
  amount?: number;
  onClick?: () => void;
}

export interface ComparisonItem {
  label: string;
  current: number;
  previous: number;
  /** Render a value; defaults to a grouped number. */
  format?: (value: number) => string;
}

interface DetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Plain-language explanation of where the number comes from. */
  derivation: string;
  /** The headline value, already formatted. */
  headline: string;
  headlineUnit?: string;
  headlineSub?: ReactNode;
  /** Series for the trend chart. */
  trend?: MonthPoint[];
  /** Which field of each trend point to plot. */
  trendMetric?: 'visits' | 'cost';
  comparisons?: ComparisonItem[];
  records?: DetailRecord[];
  recordsTitle?: string;
  onExportCsv?: () => void;
  onResetFilter?: () => void;
  /** Extra content below the trend, e.g. a full breakdown table. */
  children?: ReactNode;
}

export function DetailModal({
  open,
  onOpenChange,
  title,
  derivation,
  headline,
  headlineUnit,
  headlineSub,
  trend,
  trendMetric = 'visits',
  comparisons,
  records,
  recordsTitle = 'รายการล่าสุด',
  onExportCsv,
  onResetFilter,
  children,
}: DetailModalProps) {
  const metricLabel = trendMetric === 'cost' ? 'ยอดเงิน' : 'จำนวน visit';
  const formatMetric =
    trendMetric === 'cost' ? (v: number) => formatBaht(v) : (v: number) => formatNumber(v);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">{title}</DialogTitle>
          <DialogDescription className="leading-relaxed">
            {derivation}
          </DialogDescription>
        </DialogHeader>

        {/* Headline -------------------------------------------------------- */}
        <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold tabular-nums tracking-tight">
              {headline}
            </span>
            {headlineUnit && (
              <span className="text-sm font-medium text-muted-foreground">
                {headlineUnit}
              </span>
            )}
          </div>
          {headlineSub && (
            <div className="mt-2 text-sm text-muted-foreground">{headlineSub}</div>
          )}
        </div>

        {/* Prior-period comparison ----------------------------------------- */}
        {comparisons && comparisons.length > 0 && (
          <section>
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              เทียบกับช่วงก่อนหน้า
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
              {comparisons.map((item) => {
                const format = item.format ?? ((v: number) => formatNumber(v));
                const change =
                  item.previous === 0
                    ? null
                    : Math.round(((item.current - item.previous) / item.previous) * 1000) /
                      10;

                return (
                  <div
                    key={item.label}
                    className="rounded-xl border border-border/60 px-3 py-3"
                  >
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums">
                      {format(item.current)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                      ก่อนหน้า {format(item.previous)}
                    </p>
                    <div className="mt-2">
                      <ChangeBadge change={change} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Trend ----------------------------------------------------------- */}
        {trend && trend.length > 0 && (
          <section>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              แนวโน้ม 12 เดือน — {metricLabel}
            </h3>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="detailFill" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor="hsl(var(--chart-1))"
                        stopOpacity={0.28}
                      />
                      <stop
                        offset="100%"
                        stopColor="hsl(var(--chart-1))"
                        stopOpacity={0.02}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                    width={52}
                    tickFormatter={(v: number) => formatNumber(v)}
                  />
                  <Tooltip
                    formatter={(v) => [formatMetric(Number(v)), metricLabel]}
                    contentStyle={{
                      borderRadius: 12,
                      border: '1px solid hsl(var(--border))',
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey={trendMetric}
                    stroke="hsl(var(--chart-1))"
                    strokeWidth={2}
                    fill="url(#detailFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        {children}

        {/* Recent records --------------------------------------------------- */}
        {records && records.length > 0 && (
          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-foreground">
                {recordsTitle}{' '}
                <span className="font-normal text-muted-foreground">
                  ({formatNumber(records.length)})
                </span>
              </h3>
              {onExportCsv && (
                <button
                  type="button"
                  onClick={onExportCsv}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
                >
                  <Download className="h-3.5 w-3.5" />
                  ดาวน์โหลด CSV
                </button>
              )}
            </div>

            <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60">
              {records.map((rec) => (
                <li key={rec.id}>
                  <button
                    type="button"
                    onClick={rec.onClick}
                    className={cn(
                      'flex w-full items-center justify-between gap-4 px-4 py-2.5 text-left',
                      rec.onClick
                        ? 'cursor-pointer transition-colors hover:bg-muted/40'
                        : 'cursor-default',
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {rec.primary}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {rec.secondary}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-xs tabular-nums text-muted-foreground">
                        {formatThaiDate(rec.date)}
                        {rec.time ? ` · ${formatTime(rec.time)}` : ''}
                      </span>
                      {rec.amount !== undefined && (
                        <span className="block text-sm font-medium tabular-nums">
                          {formatBaht(rec.amount)}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Footer ----------------------------------------------------------- */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
          {onResetFilter ? (
            <button
              type="button"
              onClick={onResetFilter}
              className="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              ล้างตัวกรอง
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="cursor-pointer rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            ปิด
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Row of label/value pairs used inside a modal's extra content. */
export function DetailFacts({
  items,
}: {
  items: ReadonlyArray<{ label: string; value: string }>;
}) {
  return (
    <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="flex justify-between gap-3 text-sm">
          <dt className="text-muted-foreground">{item.label}</dt>
          <dd className="font-medium tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Share list used when a KPI's makeup matters more than its total. */
export function ShareList({
  items,
}: {
  items: ReadonlyArray<{ label: string; visits: number; percent: number }>;
}) {
  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{item.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {formatNumber(item.visits)} · {formatPercent(item.percent)}
            </span>
          </div>
          <ProportionBar percent={item.percent} />
        </li>
      ))}
    </ul>
  );
}
