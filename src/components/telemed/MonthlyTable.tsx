// =============================================================================
// Telemedicine Dashboard - month × service table
//
// Rows are the twelve fiscal months, columns the three services plus the
// all-services total. Each cell shows visits with the amount beneath it.
// Months that have not started are dimmed rather than hidden, so the fiscal
// year always reads October to September.
// =============================================================================

import { cn } from '@/lib/utils';
import { SERVICE_VISUALS } from '@/components/telemed/serviceTheme';
import { TELEMED_SERVICES, summarizeSeries } from '@/services/telemed';
import type { FiscalMonthPoint, Metrics } from '@/services/telemed';
import { NO_VALUE, formatNumber } from '@/utils/format';

export function MonthlyTable({ series }: { series: readonly FiscalMonthPoint[] }) {
  const total = summarizeSeries(series);

  return (
    <div className="-mx-2 overflow-x-auto px-2">
      <table className="w-full min-w-[560px] border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th scope="col" className="border-b border-border px-3 py-2.5 text-left font-medium">
              เดือน
            </th>
            {TELEMED_SERVICES.map((s) => (
              <th
                key={s.key}
                scope="col"
                className="border-b border-border px-3 py-2.5 text-right font-medium"
              >
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className={cn('h-2 w-2 rounded-full', SERVICE_VISUALS[s.key].dot)}
                  />
                  {s.label}
                </span>
              </th>
            ))}
            <th
              scope="col"
              className="border-b border-border px-3 py-2.5 text-right font-semibold text-foreground"
            >
              รวม
            </th>
          </tr>
        </thead>

        <tbody>
          {series.map((point) => (
            <tr
              key={point.month}
              data-future={point.isFuture ? 'true' : undefined}
              className={cn(
                'transition-colors hover:bg-accent/40',
                point.isFuture && 'text-muted-foreground/50',
              )}
            >
              <th
                scope="row"
                className="border-b border-border/50 px-3 py-2.5 text-left font-medium"
              >
                {point.label}
              </th>
              {TELEMED_SERVICES.map((s) => (
                <Cell key={s.key} metrics={point.services[s.key]} future={point.isFuture} />
              ))}
              <Cell metrics={point.total} future={point.isFuture} strong />
            </tr>
          ))}
        </tbody>

        <tfoot>
          <tr className="bg-accent/50">
            <th scope="row" className="rounded-l-xl px-3 py-3 text-left font-semibold">
              รวม
            </th>
            {TELEMED_SERVICES.map((s) => (
              <Cell key={s.key} metrics={total.services[s.key]} strong className="border-b-0" />
            ))}
            <Cell metrics={total.total} strong className="rounded-r-xl border-b-0 text-primary" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Cell({
  metrics,
  future = false,
  strong = false,
  className,
}: {
  metrics: Metrics;
  future?: boolean;
  strong?: boolean;
  className?: string;
}) {
  const empty = future && metrics.visits === 0 && metrics.amount === 0;

  return (
    <td
      className={cn(
        'border-b border-border/50 px-3 py-2.5 text-right tabular-nums',
        className,
      )}
    >
      {empty ? (
        <span>{NO_VALUE}</span>
      ) : (
        <>
          <span className={cn('block', strong ? 'font-semibold' : 'font-medium')}>
            {formatNumber(metrics.visits)}
          </span>
          <span className="block text-xs text-muted-foreground">
            {formatNumber(metrics.amount)} ฿
          </span>
        </>
      )}
    </td>
  );
}
