// =============================================================================
// Telemedicine Dashboard - monthly trend chart
//
// Stacked bars per service across the twelve fiscal months, with the prior
// fiscal year's all-services total as a dashed line for context. Months that
// have not started yet are shaded. Clicking a segment opens that service.
// =============================================================================

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn } from '@/lib/utils';
import { SERVICE_VISUALS } from '@/components/telemed/serviceTheme';
import { TELEMED_SERVICES } from '@/services/telemed';
import type { FiscalMonthPoint, ServiceKey } from '@/services/telemed';
import { formatBaht, formatNumber } from '@/utils/format';

export type TrendMetric = 'visits' | 'amount';

interface ChartDatum {
  label: string;
  isFuture: boolean;
  b2b: number;
  b2c: number;
  telehealth: number;
  total: number;
  previous: number;
}

interface MonthlyTrendChartProps {
  series: readonly FiscalMonthPoint[];
  previousSeries: readonly FiscalMonthPoint[];
  previousFiscalYear: number;
  metric: TrendMetric;
  onSelectService: (key: ServiceKey) => void;
}

/** `1,250,000` → `1.3M`, `12,500` → `12.5k`, for a compact axis. */
function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${formatNumber(value / 1_000_000, 1)}M`;
  if (abs >= 1_000) return `${formatNumber(value / 1_000, abs >= 10_000 ? 0 : 1)}k`;
  return formatNumber(value);
}

export function MonthlyTrendChart({
  series,
  previousSeries,
  previousFiscalYear,
  metric,
  onSelectService,
}: MonthlyTrendChartProps) {
  const data: ChartDatum[] = series.map((p, i) => ({
    label: p.label,
    isFuture: p.isFuture,
    b2b: p.services.b2b[metric],
    b2c: p.services.b2c[metric],
    telehealth: p.services.telehealth[metric],
    total: p.total[metric],
    previous: previousSeries[i]?.total[metric] ?? 0,
  }));

  const future = data.filter((d) => d.isFuture);
  const format = metric === 'amount' ? formatBaht : (v: number) => formatNumber(v);
  const topKey = TELEMED_SERVICES[TELEMED_SERVICES.length - 1].key;

  return (
    <div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="28%">
            <CartesianGrid strokeDasharray="3 6" stroke="hsl(var(--border))" vertical={false} />
            {future.length > 0 && (
              <ReferenceArea
                x1={future[0].label}
                x2={future[future.length - 1].label}
                fill="hsl(var(--muted))"
                fillOpacity={0.6}
                ifOverflow="extendDomain"
              />
            )}
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              interval={0}
              tickMargin={8}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              width={48}
              tickFormatter={compact}
            />
            <Tooltip
              cursor={{ fill: 'hsl(var(--accent))', opacity: 0.6 }}
              content={({ active, payload, label }) => (
                <TrendTooltip
                  active={active}
                  datum={payload?.[0]?.payload as ChartDatum | undefined}
                  label={String(label ?? '')}
                  format={format}
                  previousFiscalYear={previousFiscalYear}
                />
              )}
            />
            {TELEMED_SERVICES.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stackId="services"
                fill={SERVICE_VISUALS[s.key].color}
                radius={s.key === topKey ? [6, 6, 0, 0] : [0, 0, 0, 0]}
                cursor="pointer"
                onClick={() => onSelectService(s.key)}
                maxBarSize={36}
              />
            ))}
            <Line
              dataKey="previous"
              name={`ปีงบ ${previousFiscalYear}`}
              type="monotone"
              stroke="hsl(var(--muted-foreground))"
              strokeOpacity={0.55}
              strokeWidth={1.5}
              strokeDasharray="5 5"
              dot={false}
              activeDot={{ r: 3 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <ul className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        {TELEMED_SERVICES.map((s) => (
          <li key={s.key} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={cn('h-2.5 w-2.5 rounded-sm', SERVICE_VISUALS[s.key].dot)} />
            {s.label}
          </li>
        ))}
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="w-4 border-t-[1.5px] border-dashed border-muted-foreground/60" />
          รวมปีงบ {previousFiscalYear}
        </li>
        {future.length > 0 && (
          <li className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-muted" />
            เดือนที่ยังไม่ถึง
          </li>
        )}
      </ul>
    </div>
  );
}

function TrendTooltip({
  active,
  datum,
  label,
  format,
  previousFiscalYear,
}: {
  active?: boolean;
  datum?: ChartDatum;
  label: string;
  format: (value: number) => string;
  previousFiscalYear: number;
}) {
  if (!active || !datum) return null;

  return (
    <div className="min-w-48 rounded-xl border border-border/70 bg-white/95 px-3.5 py-3 text-xs shadow-[0_12px_32px_-12px_rgb(15_23_42/0.25)] backdrop-blur">
      <p className="mb-2 text-sm font-semibold text-foreground">{label}</p>
      <ul className="space-y-1">
        {TELEMED_SERVICES.map((s) => (
          <li key={s.key} className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className={cn('h-2 w-2 rounded-full', SERVICE_VISUALS[s.key].dot)} />
              {s.label}
            </span>
            <span className="tabular-nums font-medium text-foreground">{format(datum[s.key])}</span>
          </li>
        ))}
      </ul>
      <div className="mt-2 space-y-1 border-t border-border/60 pt-2">
        <p className="flex justify-between gap-4 font-semibold text-foreground">
          <span>รวม</span>
          <span className="tabular-nums">{format(datum.total)}</span>
        </p>
        <p className="flex justify-between gap-4 text-muted-foreground">
          <span>ปีงบ {previousFiscalYear}</span>
          <span className="tabular-nums">{format(datum.previous)}</span>
        </p>
      </div>
    </div>
  );
}
