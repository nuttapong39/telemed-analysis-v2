// =============================================================================
// Telemedicine Dashboard - monthly trend chart
//
// Stacked bars per service across the twelve fiscal months, with the prior
// fiscal year's all-services total as a dashed line for context. Months that
// have not started yet are shaded. Clicking a segment opens that service.
// Services past the eighth colour slot fold into one "อื่นๆ" segment.
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
import { OTHER_VISUAL, SERVICE_SLOT_COUNT } from '@/components/telemed/serviceTheme';
import type { ServiceEntry, ServiceVisual } from '@/components/telemed/serviceTheme';
import type { FiscalMonthPoint } from '@/services/telemed';
import { formatBaht, formatNumber } from '@/utils/format';

export type TrendMetric = 'visits' | 'amount';

/** Plot height in px. */
const CHART_HEIGHT = 288;

interface ChartDatum {
  label: string;
  isFuture: boolean;
  total: number;
  previous: number;
  /** One value per stack, keyed by {@link Stack.dataKey}. */
  [stack: string]: string | number | boolean;
}

/** One stacked segment: a service, or every service past the colour slots. */
interface Stack {
  dataKey: string;
  label: string;
  visual: ServiceVisual;
  icodes: string[];
  /** Set when the segment is a single service, so a click can open it. */
  icode: string | null;
}

interface MonthlyTrendChartProps {
  series: readonly FiscalMonthPoint[];
  previousSeries: readonly FiscalMonthPoint[];
  services: readonly ServiceEntry[];
  previousFiscalYear: number;
  metric: TrendMetric;
  onSelectService: (icode: string) => void;
}

function toStacks(services: readonly ServiceEntry[]): Stack[] {
  const stacks: Stack[] = services.slice(0, SERVICE_SLOT_COUNT).map((s) => ({
    dataKey: `svc_${s.icode}`,
    label: s.name,
    visual: s.visual,
    icodes: [s.icode],
    icode: s.icode,
  }));
  const rest = services.slice(SERVICE_SLOT_COUNT);
  if (rest.length > 0) {
    stacks.push({
      dataKey: 'svc_other',
      label: `อื่นๆ (${rest.length} รหัส)`,
      visual: OTHER_VISUAL,
      icodes: rest.map((s) => s.icode),
      icode: null,
    });
  }
  return stacks;
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
  services,
  previousFiscalYear,
  metric,
  onSelectService,
}: MonthlyTrendChartProps) {
  const stacks = toStacks(services);
  const data: ChartDatum[] = series.map((p, i) => {
    const datum: ChartDatum = {
      label: p.label,
      isFuture: p.isFuture,
      total: p.total[metric],
      previous: previousSeries[i]?.total[metric] ?? 0,
    };
    for (const stack of stacks) {
      datum[stack.dataKey] = stack.icodes.reduce(
        (sum, icode) => sum + (p.services[icode]?.[metric] ?? 0),
        0,
      );
    }
    return datum;
  });

  const future = data.filter((d) => d.isFuture);
  const format = metric === 'amount' ? formatBaht : (v: number) => formatNumber(v);
  const topKey = stacks[stacks.length - 1]?.dataKey;

  return (
    <div>
      {/* A numeric height keeps the first render, before the container is
          measured, from triggering Recharts' "width(-1) and height(-1)" warning. */}
      <div className="w-full min-w-0">
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
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
                  stacks={stacks}
                  datum={payload?.[0]?.payload as ChartDatum | undefined}
                  label={String(label ?? '')}
                  format={format}
                  previousFiscalYear={previousFiscalYear}
                />
              )}
            />
            {stacks.map((s) => (
              <Bar
                key={s.dataKey}
                dataKey={s.dataKey}
                name={s.label}
                stackId="services"
                fill={s.visual.color}
                radius={s.dataKey === topKey ? [6, 6, 0, 0] : [0, 0, 0, 0]}
                cursor={s.icode ? 'pointer' : 'default'}
                onClick={() => {
                  if (s.icode) onSelectService(s.icode);
                }}
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
        {stacks.map((s) => (
          <li key={s.dataKey} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={cn('h-2.5 w-2.5 rounded-sm', s.visual.dot)} />
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
  stacks,
  datum,
  label,
  format,
  previousFiscalYear,
}: {
  active?: boolean;
  stacks: readonly Stack[];
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
        {stacks.map((s) => (
          <li key={s.dataKey} className="flex items-center justify-between gap-4">
            <span className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground">
              <span className={cn('h-2 w-2 shrink-0 rounded-full', s.visual.dot)} />
              <span className="max-w-48 truncate">{s.label}</span>
            </span>
            <span className="tabular-nums font-medium text-foreground">
              {format(Number(datum[s.dataKey]))}
            </span>
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
