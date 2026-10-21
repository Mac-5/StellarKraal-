'use client';
/**
 * DataTable — Issue #1101
 *
 * Responsive data table with:
 * - Sortable column headers (asc/desc toggle)
 * - Sort state synced to URL query params
 * - Horizontal scroll container for mobile
 * - Sticky first column for identification on small screens
 * - aria-sort attribute on column headers
 */
import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import ScrollableTable from './ScrollableTable';

/* ─── Types ─────────────────────────────────────────────────── */

export type SortDirection = 'asc' | 'desc';

export interface ColumnDef<T> {
  /** Unique key matching a field in the data row */
  key: keyof T & string;
  /** Column header label */
  label: string;
  /** Disable sorting for this column */
  sortable?: boolean;
  /** Optional custom cell renderer */
  render?: (value: T[keyof T], row: T) => React.ReactNode;
  /** Additional Tailwind classes for the cell */
  className?: string;
}

export interface DataTableProps<T extends Record<string, unknown>> {
  /** Column definitions */
  columns: ColumnDef<T>[];
  /** Data rows */
  data: T[];
  /** URL query-param name for sort column (default: "sortBy") */
  sortByParam?: string;
  /** URL query-param name for sort direction (default: "sortDir") */
  sortDirParam?: string;
  /** Row key extractor */
  rowKey: (row: T) => string;
  /** Caption for accessibility */
  caption?: string;
  /** Empty state message */
  emptyMessage?: string;
}

/* ─── Sort icon ──────────────────────────────────────────────── */
function SortIcon({ direction }: { direction: SortDirection | null }) {
  if (!direction)
    return (
      <span aria-hidden="true" className="ml-1 text-brown/30 text-xs select-none">
        ↕
      </span>
    );
  return (
    <span aria-hidden="true" className="ml-1 text-gold text-xs select-none">
      {direction === 'asc' ? '▲' : '▼'}
    </span>
  );
}

/* ─── Component ──────────────────────────────────────────────── */
export default function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  sortByParam = 'sortBy',
  sortDirParam = 'sortDir',
  rowKey,
  caption,
  emptyMessage = 'No records found.',
}: DataTableProps<T>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  /* Read current sort state from URL */
  const currentSortBy = searchParams.get(sortByParam) as (keyof T & string) | null;
  const currentSortDir = (searchParams.get(sortDirParam) as SortDirection) ?? 'asc';

  /* Update URL when user clicks a column header */
  const handleSort = useCallback(
    (colKey: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (currentSortBy === colKey) {
        /* Toggle direction */
        params.set(sortDirParam, currentSortDir === 'asc' ? 'desc' : 'asc');
      } else {
        params.set(sortByParam, colKey);
        params.set(sortDirParam, 'asc');
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams, currentSortBy, currentSortDir, sortByParam, sortDirParam]
  );

  /* Sort data client-side */
  const sortedData = useMemo(() => {
    if (!currentSortBy) return data;
    return [...data].sort((a, b) => {
      const aVal = a[currentSortBy];
      const bVal = b[currentSortBy];
      let cmp = 0;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        cmp = aVal - bVal;
      } else {
        cmp = String(aVal ?? '').localeCompare(String(bVal ?? ''));
      }
      return currentSortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, currentSortBy, currentSortDir]);

  return (
    /* Horizontal scroll wrapper with swipe hint for mobile (#1415) */
    <ScrollableTable label={caption ?? 'Data table'} className="rounded-2xl shadow">
      <table className="min-w-full bg-white text-sm" role="grid" aria-label={caption}>
        {caption && <caption className="sr-only">{caption}</caption>}

        <thead className="bg-brown text-cream">
          <tr>
            {columns.map((col, idx) => {
              const isSorted = currentSortBy === col.key;
              const ariaSort: React.AriaAttributes['aria-sort'] = isSorted
                ? currentSortDir === 'asc'
                  ? 'ascending'
                  : 'descending'
                : 'none';

              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={col.sortable !== false ? ariaSort : undefined}
                  className={[
                    'px-4 py-3 text-left font-semibold whitespace-nowrap select-none',
                    /* Sticky first column */
                    idx === 0 ? 'sticky left-0 z-10 bg-brown' : '',
                    col.sortable !== false ? 'cursor-pointer hover:bg-brown/80 transition' : '',
                    col.className ?? '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={col.sortable !== false ? () => handleSort(col.key) : undefined}
                  onKeyDown={
                    col.sortable !== false
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleSort(col.key);
                          }
                        }
                      : undefined
                  }
                  tabIndex={col.sortable !== false ? 0 : undefined}
                  role={col.sortable !== false ? 'button' : undefined}
                >
                  {col.label}
                  {col.sortable !== false && (
                    <SortIcon direction={isSorted ? currentSortDir : null} />
                  )}
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {sortedData.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-brown/50">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            sortedData.map((row, rowIdx) => (
              <tr
                key={rowKey(row)}
                className={
                  rowIdx % 2 === 0
                    ? 'bg-white hover:bg-cream/60 transition'
                    : 'bg-cream/40 hover:bg-cream/70 transition'
                }
              >
                {columns.map((col, colIdx) => {
                  const cellValue = row[col.key];
                  return (
                    <td
                      key={col.key}
                      className={[
                        'px-4 py-3 whitespace-nowrap text-brown',
                        /* Sticky first column */
                        colIdx === 0
                          ? rowIdx % 2 === 0
                            ? 'sticky left-0 z-10 bg-white'
                            : 'sticky left-0 z-10 bg-cream/40'
                          : '',
                        col.className ?? '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {col.render
                        ? col.render(cellValue, row)
                        : ((cellValue as React.ReactNode) ?? '—')}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </ScrollableTable>
  );
}
