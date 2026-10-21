/**
 * AdminTable — reusable table shell for all admin list views (#802).
 *
 * Features
 * ────────
 * • Zebra striping: even rows get a subtle `bg-brown/[0.04]` tint
 *   (dark: `bg-cream/[0.04]`). Both pass WCAG AA contrast — the background
 *   difference is purely aesthetic.
 * • Hover highlight: every row brightens on hover using the primary token
 *   colour at 6 % opacity.
 * • Pressed state: `active:` drops the opacity slightly to give tactile
 *   feedback on row clicks.
 * • All colours use design tokens so they flip automatically in dark mode.
 *
 * Usage
 * ─────
 * ```tsx
 * <AdminTable
 *   columns={["Address", "Loans", "Status"]}
 *   data={users}
 *   renderRow={(user, index) => (
 *     <AdminTableRow key={user.id} index={index} onClick={() => openUser(user.id)}>
 *       <AdminTableCell>{user.address}</AdminTableCell>
 *       <AdminTableCell>{user.loans}</AdminTableCell>
 *       <AdminTableCell><StatusBadge status={user.status} /></AdminTableCell>
 *     </AdminTableRow>
 *   )}
 * />
 * ```
 */

import { ReactNode, type MouseEventHandler } from 'react';
import { cn } from '@/lib/utils';
import ScrollableTable from './ScrollableTable';

// ── Table wrapper ──────────────────────────────────────────────────────────────

interface AdminTableProps {
  /** Column header labels. */
  columns: string[];
  /** Zero or more data rows rendered via the render prop. */
  children?: ReactNode;
  /** Optional caption for screen readers. */
  caption?: string;
  className?: string;
}

export function AdminTable({ columns, children, caption, className }: AdminTableProps) {
  return (
    <ScrollableTable label={caption ?? 'Table'} className={className}>
      <table className="w-full text-sm border-collapse">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="bg-brown/5 dark:bg-cream/5 border-b border-brown/10 dark:border-cream/10">
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                scope="col"
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-brown-600 dark:text-cream-200"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-brown/5 dark:divide-cream/5">{children}</tbody>
      </table>
    </ScrollableTable>
  );
}

// ── Table row ─────────────────────────────────────────────────────────────────

interface AdminTableRowProps {
  /** Row index (0-based) — used to derive the zebra stripe. */
  index: number;
  /** When provided the row becomes interactive: hover + pressed state. */
  onClick?: MouseEventHandler<HTMLTableRowElement>;
  children: ReactNode;
  className?: string;
}

/**
 * Accessible, optionally-clickable table row with:
 * - Zebra striping (even rows tinted)
 * - Hover highlight (both light and dark)
 * - Pressed state on click
 * - `role="button"` + `tabIndex` + keyboard Enter/Space when `onClick` is set
 */
export function AdminTableRow({ index, onClick, children, className }: AdminTableRowProps) {
  const isEven = index % 2 === 0;
  const isInteractive = !!onClick;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTableRowElement>) => {
    if (isInteractive && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick?.(e as unknown as React.MouseEvent<HTMLTableRowElement>);
    }
  };

  return (
    <tr
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={isInteractive ? handleKeyDown : undefined}
      className={cn(
        // ── Zebra stripe ───────────────────────────────────────────────────────
        isEven ? 'bg-brown/[0.04] dark:bg-cream/[0.04]' : 'bg-transparent',

        // ── Hover highlight ────────────────────────────────────────────────────
        'hover:bg-gold/10 dark:hover:bg-gold/10 transition-colors duration-100',

        // ── Pressed / active state ─────────────────────────────────────────────
        isInteractive &&
          [
            'cursor-pointer',
            'active:bg-gold/20 dark:active:bg-gold/20',
            'focus-visible:outline-none focus-visible:ring-2',
            'focus-visible:ring-inset focus-visible:ring-gold-500',
          ].join(' '),

        className
      )}
    >
      {children}
    </tr>
  );
}

// ── Table cell ────────────────────────────────────────────────────────────────

interface AdminTableCellProps {
  children: ReactNode;
  className?: string;
}

export function AdminTableCell({ children, className }: AdminTableCellProps) {
  return (
    <td className={cn('px-4 py-3 text-brown-700 dark:text-cream-200', className)}>{children}</td>
  );
}
