// =============================================================================
// Telemedicine Dashboard - searchable, sortable detail table
//
// The fiscal year's summary rows at their full grain (month × service ×
// visit type) — the same rows as the CSV export. One search box filters on
// month, service name, code and visit type; every column header sorts.
// =============================================================================

import { useMemo, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type { ColumnDef, FilterFn, SortingState } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { SortableHeader } from '@/components/telemed/SortableHeader';
import { OTHER_VISUAL } from '@/components/telemed/serviceTheme';
import type { ServiceEntry } from '@/components/telemed/serviceTheme';
import { fiscalMonthLabel, visitTypeLabel } from '@/services/telemed';
import type { MonthlyServiceRow } from '@/services/telemed';
import { formatNumber } from '@/utils/format';

const PAGE_SIZE = 25;

interface DetailRow extends MonthlyServiceRow {
  monthLabel: string;
  visitTypeName: string;
  dot: string;
  /** Lower-cased text the search box matches against. */
  searchText: string;
}

const matchesSearch: FilterFn<DetailRow> = (row, _columnId, query: string) =>
  row.original.searchText.includes(query.trim().toLowerCase());

function numberColumn(
  id: 'itemRows' | 'visits' | 'qty' | 'amount' | 'zeroPriceRows',
  header: string,
  strong = false,
): ColumnDef<DetailRow> {
  return {
    id,
    accessorFn: (r) => r[id],
    header,
    cell: (info) => (
      <span className={cn(strong && 'font-medium')}>{formatNumber(info.getValue<number>())}</span>
    ),
  };
}

const COLUMNS: ColumnDef<DetailRow>[] = [
  { id: 'month', accessorFn: (r) => r.month, header: 'เดือน' },
  { id: 'service', accessorFn: (r) => r.serviceName, header: 'บริการ' },
  { id: 'visitType', accessorFn: (r) => r.visitTypeName, header: 'ประเภทการมา' },
  numberColumn('itemRows', 'รายการ'),
  numberColumn('visits', 'Visit', true),
  numberColumn('qty', 'จำนวน'),
  numberColumn('amount', 'ยอดเงิน (บาท)'),
  numberColumn('zeroPriceRows', 'ไม่คิดเงิน'),
];

const LEFT_ALIGNED = new Set(['month', 'service', 'visitType']);

export function DetailDataTable({
  rows,
  services,
  visitTypeNames,
}: {
  /** The fiscal year's rows, in display order. */
  rows: readonly MonthlyServiceRow[];
  services: readonly ServiceEntry[];
  visitTypeNames: ReadonlyMap<string, string>;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [query, setQuery] = useState('');

  const data = useMemo<DetailRow[]>(() => {
    const dotByIcode = new Map(services.map((s) => [s.icode, s.visual.dot]));
    return rows.map((r) => {
      const monthLabel = fiscalMonthLabel(r.month);
      const visitTypeName = visitTypeLabel(r.visitTypeCode, visitTypeNames);
      return {
        ...r,
        monthLabel,
        visitTypeName,
        dot: dotByIcode.get(r.icode) ?? OTHER_VISUAL.dot,
        searchText: [monthLabel, r.month, r.serviceName, r.icode, visitTypeName, r.visitTypeCode]
          .join(' ')
          .toLowerCase(),
      };
    });
  }, [rows, services, visitTypeNames]);

  // TanStack keeps its own mutable state; it opts out of React Compiler memoisation.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns: COLUMNS,
    state: { sorting, globalFilter: query },
    onSortingChange: setSorting,
    onGlobalFilterChange: setQuery,
    globalFilterFn: matchesSearch,
    // Every column shares one row-level match, so test it once per row.
    getColumnCanGlobalFilter: (column) => column.id === 'month',
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageIndex: 0, pageSize: PAGE_SIZE } },
  });

  const shown = table.getFilteredRowModel().rows.length;
  const pageCount = table.getPageCount();
  const searching = query.trim() !== '';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="relative w-full sm:max-w-xs">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="ค้นหาในตารางรายละเอียด"
            placeholder="ค้นหาเดือน บริการ รหัส หรือประเภทการมา"
            className="h-9 rounded-xl bg-white pl-9"
          />
        </label>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {searching
            ? `พบ ${formatNumber(shown)} จาก ${formatNumber(data.length)} แถว`
            : `ทั้งหมด ${formatNumber(data.length)} แถว`}
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border/70">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => (
                  <SortableHeader
                    key={header.id}
                    column={header.column}
                    align={LEFT_ALIGNED.has(header.column.id) ? 'left' : 'right'}
                    className="px-3 py-2"
                  >
                    {String(header.column.columnDef.header)}
                  </SortableHeader>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-border/50">
            {table.getRowModel().rows.map((row) => {
              const r = row.original;
              return (
                <tr key={row.id} className="transition-colors hover:bg-accent/40">
                  <th scope="row" className="whitespace-nowrap px-3 py-2 text-left font-medium">
                    {r.monthLabel}
                  </th>
                  <td className="px-3 py-2 text-left">
                    <span className="inline-flex max-w-56 items-center gap-1.5" title={`${r.serviceName} · รหัส ${r.icode}`}>
                      <span aria-hidden="true" className={cn('h-2 w-2 shrink-0 rounded-full', r.dot)} />
                      <span className="truncate">{r.serviceName}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{r.icode}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2 text-left">{r.visitTypeName}</td>
                  {/* The three text columns above carry their own markup; the
                      numeric columns render through their column defs. */}
                  {row
                    .getVisibleCells()
                    .slice(3)
                    .map((cell) => (
                      <td key={cell.id} className="px-3 py-2 text-right tabular-nums">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                </tr>
              );
            })}
            {shown === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  <p>{searching ? `ไม่พบรายการที่ตรงกับ "${query.trim()}"` : 'ไม่มีรายการในปีงบประมาณนี้'}</p>
                  {searching && (
                    <button
                      type="button"
                      onClick={() => setQuery('')}
                      className="mt-2 cursor-pointer text-sm font-medium text-primary hover:underline"
                    >
                      ล้างคำค้น
                    </button>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <button
            type="button"
            aria-label="หน้าก่อน"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg border border-border bg-white hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="tabular-nums">
            หน้า {table.getState().pagination.pageIndex + 1} / {pageCount}
          </span>
          <button
            type="button"
            aria-label="หน้าถัดไป"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg border border-border bg-white hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
