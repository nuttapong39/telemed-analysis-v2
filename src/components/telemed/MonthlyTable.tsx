// =============================================================================
// Telemedicine Dashboard - month × service table
//
// Rows are the twelve fiscal months, columns the hospital's TELMED services
// (ordered by code) plus the all-services total. Each cell shows visits with
// the amount beneath it. Months that have not started are dimmed rather than
// hidden, so by default the fiscal year reads October to September; clicking
// a header sorts the months by that column's visits. The total row stays last.
// =============================================================================

import { useMemo, useState } from 'react';
import { getCoreRowModel, getSortedRowModel, useReactTable } from '@tanstack/react-table';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { cn } from '@/lib/utils';
import { SortableHeader } from '@/components/telemed/SortableHeader';
import type { ServiceEntry } from '@/components/telemed/serviceTheme';
import { emptyMetrics, summarizeSeries } from '@/services/telemed';
import type { FiscalMonthPoint, Metrics } from '@/services/telemed';
import { NO_VALUE, formatNumber } from '@/utils/format';

const TOTAL_COLUMN = 'total';

export function MonthlyTable({
  series,
  services,
}: {
  series: readonly FiscalMonthPoint[];
  services: readonly ServiceEntry[];
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const total = summarizeSeries(series);
  // Month label + total, plus room for each service column.
  const minWidth = 240 + services.length * 128;

  const columns = useMemo<ColumnDef<FiscalMonthPoint>[]>(
    () => [
      { id: 'month', accessorFn: (p) => p.month },
      ...services.map<ColumnDef<FiscalMonthPoint>>((s) => ({
        id: s.icode,
        accessorFn: (p) => p.services[s.icode]?.visits ?? 0,
      })),
      { id: TOTAL_COLUMN, accessorFn: (p) => p.total.visits },
    ],
    [services],
  );

  const data = useMemo(() => [...series], [series]);
  // TanStack keeps its own mutable state; it opts out of React Compiler memoisation.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  const column = (id: string) => table.getColumn(id)!;

  return (
    <div className="-mx-2 overflow-x-auto px-2">
      <table
        className="w-full border-separate border-spacing-0 text-sm"
        style={{ minWidth }}
      >
        <thead>
          <tr className="text-xs text-muted-foreground">
            <SortableHeader
              column={column('month')}
              align="left"
              className="border-b border-border px-3 py-2.5"
            >
              เดือน
            </SortableHeader>
            {services.map((s) => (
              <SortableHeader
                key={s.icode}
                column={column(s.icode)}
                title={`${s.name} · รหัส ${s.icode}`}
                className="border-b border-border px-3 py-2.5"
              >
                <span
                  aria-hidden="true"
                  className={cn('h-2 w-2 shrink-0 rounded-full', s.visual.dot)}
                />
                <span className="max-w-36 truncate">{s.name}</span>
              </SortableHeader>
            ))}
            <SortableHeader
              column={column(TOTAL_COLUMN)}
              className="border-b border-border px-3 py-2.5 text-foreground"
            >
              <span className="font-semibold">รวม</span>
            </SortableHeader>
          </tr>
        </thead>

        <tbody>
          {table.getRowModel().rows.map(({ original: point }) => (
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
              {services.map((s) => (
                <Cell
                  key={s.icode}
                  metrics={point.services[s.icode] ?? emptyMetrics()}
                  future={point.isFuture}
                />
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
            {services.map((s) => (
              <Cell
                key={s.icode}
                metrics={total.services[s.icode] ?? emptyMetrics()}
                strong
                className="border-b-0"
              />
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
