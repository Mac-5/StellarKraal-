'use client';

import { useMemo, useState } from 'react';
import LoanSummaryCards from '@/components/LoanSummaryCards';
import { formatXlmFromStroops } from '@/lib/formatMoney';
import ScrollableTable from '@/components/ScrollableTable';

export interface PortfolioLoan {
  id: string;
  amount: number;
  outstanding?: number;
  interestAccrued?: number;
  status: string;
  createdAt: string;
  health_factor?: number | null;
}

interface Props {
  loans: PortfolioLoan[];
  /** When true, render skeleton placeholders for the stat cards — closes #1205. */
  loading?: boolean;
}

type SortKey = 'date' | 'status';

export default function LoanPortfolioSummary({ loans, loading = false }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [page, setPage] = useState(1);
  const pageSize = 8;
  const activeLoans = loans.filter(
    (loan) => !['repaid', 'liquidated'].includes(loan.status.toLowerCase())
  );
  const sortedLoans = useMemo(
    () =>
      [...loans].sort((left, right) => {
        if (sortKey === 'status') return left.status.localeCompare(right.status);
        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      }),
    [loans, sortKey]
  );
  const totalPrincipal = activeLoans.reduce((sum, loan) => sum + loan.amount, 0);
  const outstanding = activeLoans.reduce((sum, loan) => sum + (loan.outstanding ?? loan.amount), 0);
  const interestAccrued = loans.reduce((sum, loan) => sum + (loan.interestAccrued ?? 0), 0);
  const pageCount = Math.max(1, Math.ceil(sortedLoans.length / pageSize));
  const visibleLoans = sortedLoans.slice((page - 1) * pageSize, page * pageSize);

  const summary = {
    totalPrincipal,
    outstanding,
    interestAccrued,
    activeLoanCount: activeLoans.length,
  };

  return (
    <section aria-labelledby="portfolio-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="portfolio-heading" className="text-xl font-semibold text-brown">
            Loan portfolio
          </h2>
          <p className="text-sm text-brown/60">A live summary of your outstanding loans.</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-brown/70">
          Sort by
          <select
            value={sortKey}
            onChange={(event) => {
              setSortKey(event.target.value as SortKey);
              setPage(1);
            }}
            className="rounded-lg border border-brown/30 bg-white px-3 py-2 text-brown"
          >
            <option value="date">Date</option>
            <option value="status">Status</option>
          </select>
        </label>
      </div>
      <LoanSummaryCards summary={summary} loading={loading} />
      {visibleLoans.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-brown/30 p-8 text-center text-brown/70">
          No loans yet. Your completed and active loans will appear here.
        </div>
      ) : (
        <div className="rounded-2xl bg-white shadow">
          <ScrollableTable label="Loan portfolio table" className="rounded-t-2xl">
            <table className="w-full min-w-[640px] text-left text-sm">
              <caption className="sr-only">Loan portfolio</caption>
              <thead className="border-b border-brown/10 text-brown/60">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Loan
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Principal
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Outstanding
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Health
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleLoans.map((loan) => (
                  <tr key={loan.id} className="border-b border-brown/5 last:border-0">
                    <th scope="row" className="px-4 py-3 font-medium text-brown">
                      #{loan.id}
                    </th>
                    <td className="px-4 py-3 text-brown/70">{formatXlmFromStroops(loan.amount)}</td>
                    <td className="px-4 py-3 text-brown/70">
                      {formatXlmFromStroops(loan.outstanding ?? loan.amount)}
                    </td>
                    <td className="px-4 py-3 text-brown/70">
                      {loan.health_factor == null
                        ? '—'
                        : `${(loan.health_factor / 10_000).toFixed(2)}x`}
                    </td>
                    <td className="px-4 py-3 capitalize text-brown/70">{loan.status}</td>
                    <td className="px-4 py-3 text-brown/70">
                      {new Date(loan.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableTable>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-brown/10 px-4 py-3 text-sm">
            <span className="text-brown/60">
              Page {page} of {pageCount}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page === 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="rounded-lg border border-brown/20 px-3 py-1 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page === pageCount}
                onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                className="rounded-lg border border-brown/20 px-3 py-1 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
