// =============================================================================
// Telemedicine Dashboard - sortable table header cell
//
// A <th> whose label is a button that cycles a TanStack column's sort, with
// the current order exposed through `aria-sort` and a direction icon.
// =============================================================================

import type { ReactNode } from 'react';
import type { Column } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const ARIA_SORT = { asc: 'ascending', desc: 'descending' } as const;

export function SortableHeader<T>({
  column,
  children,
  align = 'right',
  className,
  title,
}: {
  column: Column<T, unknown>;
  children: ReactNode;
  align?: 'left' | 'right';
  className?: string;
  title?: string;
}) {
  const sorted = column.getIsSorted();
  const Icon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ChevronsUpDown;

  return (
    <th
      scope="col"
      aria-sort={sorted ? ARIA_SORT[sorted] : 'none'}
      title={title}
      className={cn(align === 'right' ? 'text-right' : 'text-left', className)}
    >
      <button
        type="button"
        onClick={column.getToggleSortingHandler()}
        className={cn(
          'group inline-flex max-w-full cursor-pointer items-center gap-1 rounded-md font-medium',
          'hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          align === 'right' && 'flex-row-reverse',
          sorted && 'text-foreground',
        )}
      >
        <span className="inline-flex min-w-0 items-center gap-1.5">{children}</span>
        <Icon
          aria-hidden="true"
          className={cn(
            'h-3.5 w-3.5 shrink-0',
            sorted ? 'text-primary' : 'text-muted-foreground/40 group-hover:text-muted-foreground',
          )}
        />
      </button>
    </th>
  );
}
