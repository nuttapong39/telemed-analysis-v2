// =============================================================================
// Telemedicine Dashboard - drill-down detail modal
//
// Opened from a service card or a chart segment. Answers: how is the figure
// derived, how does it compare with the prior fiscal year, which visit types
// it came from, and how did it move month by month. Everything is sliced from
// data the dashboard already holds — no second fetch.
// =============================================================================

import { useState } from 'react';
import {
  Area,
  ComposedChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Info } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { ChangeBadge, SegmentedToggle } from '@/components/telemed/primitives';
import type { ServiceVisual } from '@/components/telemed/serviceTheme';
import type { TrendMetric } from '@/components/telemed/MonthlyTrendChart';
import { TOTAL_KEY, addInto, emptyMetrics, percentChange } from '@/services/telemed';
import type { FiscalMonthPoint, Metrics, VisitTypeShare } from '@/services/telemed';
import { NO_VALUE, formatBaht, formatNumber, formatPercent } from '@/utils/format';

interface DetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** {@link TOTAL_KEY} for all services, otherwise the service's icode. */
  selection: string;
  visual: ServiceVisual;
  title: string;
  description: string;
  /** Plain-language explanation of where the numbers come from. */
  derivation: string;
  series: readonly FiscalMonthPoint[];
  previousSeries: readonly FiscalMonthPoint[];
  fiscalYear: number;
  /** Months of the fiscal year that have started — the comparison window. */
  monthCount: number;
  compareLabel: string;
  /** Visits and amount per visit type over the comparison window. */
  visitTypes: readonly VisitTypeShare[];
}

function pick(point: FiscalMonthPoint, selection: string): Metrics {
  if (selection === TOTAL_KEY) return point.total;
  return point.services[selection] ?? emptyMetrics();
}

function sum(points: readonly FiscalMonthPoint[], selection: string, count: number): Metrics {
  const out = emptyMetrics();
  for (const p of points.slice(0, count)) addInto(out, pick(p, selection));
  return out;
}

export function DetailModal({
  open,
  onOpenChange,
  selection,
  visual,
  title,
  description,
  derivation,
  series,
  previousSeries,
  fiscalYear,
  monthCount,
  compareLabel,
  visitTypes,
}: DetailModalProps) {
  const [metric, setMetric] = useState<TrendMetric>('visits');
  const Icon = visual.icon;
  const gradientId = `detail-fill-${selection}`;

  const current = sum(series, selection, monthCount);
  const previous = sum(previousSeries, selection, monthCount);
  const avg = (m: Metrics) => (m.visits > 0 ? m.amount / m.visits : 0);
  const zeroShare = (m: Metrics) => (m.itemRows > 0 ? (m.zeroPriceRows / m.itemRows) * 100 : 0);

  const chart = series.map((p, i) => ({
    label: p.label,
    current: p.isFuture ? null : pick(p, selection)[metric],
    previous: previousSeries[i] ? pick(previousSeries[i], selection)[metric] : 0,
  }));
  const format = metric === 'amount' ? formatBaht : (v: number) => formatNumber(v);

  const figures = [
    {
      label: 'Visit',
      value: formatNumber(current.visits),
      before: formatNumber(previous.visits),
      change: percentChange(current.visits, previous.visits),
    },
    {
      label: 'จำนวนเงิน',
      value: formatBaht(current.amount),
      before: formatBaht(previous.amount),
      change: percentChange(current.amount, previous.amount),
    },
    {
      label: 'เฉลี่ยต่อ Visit',
      value: current.visits > 0 ? formatBaht(avg(current)) : NO_VALUE,
      before: previous.visits > 0 ? formatBaht(avg(previous)) : NO_VALUE,
      change: percentChange(avg(current), avg(previous)),
    },
    {
      label: 'รายการไม่คิดเงิน',
      value: current.itemRows > 0 ? formatPercent(zeroShare(current)) : NO_VALUE,
      before: previous.itemRows > 0 ? formatPercent(zeroShare(previous)) : NO_VALUE,
      sub: `${formatNumber(current.zeroPriceRows)} จาก ${formatNumber(current.itemRows)} รายการ`,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] grid-cols-[minmax(0,1fr)] gap-6 overflow-y-auto rounded-2xl sm:max-w-3xl border-border/70 p-6 sm:p-7">
        <DialogHeader className="text-left">
          <div className="flex items-center gap-3">
            <span className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-2xl', visual.tile)}>
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-lg tracking-tight">{title}</DialogTitle>
              <p className="text-sm text-muted-foreground">
                {description} · ปีงบประมาณ {fiscalYear}
              </p>
            </div>
          </div>
          <DialogDescription className="mt-3 flex gap-2 rounded-xl bg-accent/60 px-3.5 py-2.5 text-xs leading-relaxed text-accent-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{derivation}</span>
          </DialogDescription>
        </DialogHeader>

        {/* Year-over-year figures ------------------------------------------ */}
        <section>
          <h3 className="mb-3 text-sm font-semibold text-foreground">{compareLabel}</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {figures.map((f) => (
              <div key={f.label} className="rounded-xl border border-border/70 bg-card px-3.5 py-3">
                <p className="text-xs text-muted-foreground">{f.label}</p>
                <p className="mt-1 truncate text-lg font-semibold tabular-nums tracking-tight">
                  {f.value}
                </p>
                <p className="mt-0.5 truncate text-xs tabular-nums text-muted-foreground">
                  ปีงบก่อน {f.before}
                </p>
                <div className="mt-2">
                  {'change' in f ? (
                    <ChangeBadge change={f.change ?? null} />
                  ) : (
                    <span className="text-xs text-muted-foreground">{f.sub}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Visit types ------------------------------------------------------ */}
        <section aria-labelledby="detail-visit-types">
          <h3 id="detail-visit-types" className="mb-1 text-sm font-semibold text-foreground">
            แยกตามประเภทการมา
          </h3>
          <p className="mb-3 text-xs text-muted-foreground">{compareLabel}</p>
          {visitTypes.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-center text-sm text-muted-foreground">
              ไม่มีรายการในช่วงที่เปรียบเทียบ
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border/70">
              <table className="w-full min-w-[480px] text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left font-medium">ประเภทการมา</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Visit</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">ยอดเงิน (บาท)</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">สัดส่วน Visit</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Visit ปีงบ {fiscalYear - 1}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {visitTypes.map((v) => (
                    <tr key={v.code}>
                      <th scope="row" className="px-3 py-2 text-left font-medium">
                        {v.name}
                        {v.code !== '' && (
                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                            {v.code}
                          </span>
                        )}
                      </th>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {formatNumber(v.visits)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(v.amount)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatPercent(v.share)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {formatNumber(v.previousVisits)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Trend ------------------------------------------------------------ */}
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-foreground">แนวโน้มรายเดือน</h3>
            <SegmentedToggle
              label="ตัวชี้วัดของกราฟ"
              value={metric}
              onChange={setMetric}
              options={[
                { value: 'visits', label: 'Visit' },
                { value: 'amount', label: 'ยอดเงิน' },
              ]}
            />
          </div>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chart} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={visual.color} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={visual.color} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 6" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                  tickMargin={8}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  tickFormatter={(v: number) => formatNumber(v)}
                />
                <Tooltip
                  formatter={(v, name) => [
                    format(Number(v)),
                    name === 'previous' ? `ปีงบ ${fiscalYear - 1}` : `ปีงบ ${fiscalYear}`,
                  ]}
                  contentStyle={{
                    borderRadius: 12,
                    border: '1px solid hsl(var(--border))',
                    boxShadow: '0 12px 32px -12px rgb(15 23 42 / 0.25)',
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="current"
                  stroke={visual.color}
                  strokeWidth={2.2}
                  fill={`url(#${gradientId})`}
                  connectNulls={false}
                />
                <Line
                  type="monotone"
                  dataKey="previous"
                  stroke="hsl(var(--muted-foreground))"
                  strokeOpacity={0.55}
                  strokeWidth={1.5}
                  strokeDasharray="5 5"
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Month table ------------------------------------------------------ */}
        <section>
          <h3 className="mb-3 text-sm font-semibold text-foreground">รายละเอียดรายเดือน</h3>
          <div className="overflow-x-auto rounded-xl border border-border/70">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium">เดือน</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">รายการ</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Visit</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">จำนวน</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">ยอดเงิน (บาท)</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">ไม่คิดเงิน</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Visit ปีงบ {fiscalYear - 1}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {series.map((p, i) => {
                  const m = pick(p, selection);
                  const before = previousSeries[i] ? pick(previousSeries[i], selection) : null;
                  return (
                    <tr key={p.month} className={cn(p.isFuture && 'text-muted-foreground/50')}>
                      <th scope="row" className="px-3 py-2 text-left font-medium">{p.label}</th>
                      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(m.itemRows)}</td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {formatNumber(m.visits)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(m.qty)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(m.amount)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(m.zeroPriceRows)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {before ? formatNumber(before.visits) : NO_VALUE}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <div className="flex justify-end border-t border-border/60 pt-4">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="cursor-pointer rounded-xl bg-primary px-5 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
          >
            ปิด
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
