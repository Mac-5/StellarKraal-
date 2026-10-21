import React, { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Inbox, SearchX, X } from 'lucide-react';

export type TransactionType = 'deposit' | 'withdraw' | 'borrow' | 'repay' | 'liquidation';

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  asset: string;
  timestamp: string;
  status?: 'pending' | 'confirmed' | 'failed';
}

interface TransactionHistoryProps {
  transactions: Transaction[];
  isLoading?: boolean;
  onCreateTransaction?: () => void;
  onClearFilters?: () => void;
  hasActiveFilters?: boolean;
}

const TYPE_LABELS: Record<TransactionType, string> = {
  deposit: 'Deposit',
  withdraw: 'Withdraw',
  borrow: 'Borrow',
  repay: 'Repay',
  liquidation: 'Liquidation',
};

const formatAmount = (amount: number, asset: string): string =>
  `${amount.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${asset}`;

const formatDate = (timestamp: string): string => {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString();
};

const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  onAction?: () => void;
}> = ({ icon, title, description, actionLabel, onAction }) => (
  <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
      {icon}
    </div>
    <h3 className="text-base font-semibold text-slate-800">{title}</h3>
    <p className="max-w-sm text-sm text-slate-500">{description}</p>
    {onAction && (
      <button
        type="button"
        onClick={onAction}
        className="mt-2 inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
      >
        {actionLabel}
      </button>
    )}
  </div>
);

const TransactionHistory: React.FC<TransactionHistoryProps> = ({
  transactions,
  isLoading = false,
  onCreateTransaction,
  onClearFilters,
  hasActiveFilters = false,
}) => {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return transactions;
    return transactions.filter(
      (tx) =>
        tx.asset.toLowerCase().includes(query) ||
        TYPE_LABELS[tx.type].toLowerCase().includes(query),
    );
  }, [transactions, search]);

  const isSearching = search.trim().length > 0;
  const showFilteredEmpty = !isLoading && transactions.length > 0 && filtered.length === 0;
  const showEmpty = !isLoading && transactions.length === 0;

  const handleClearFilters = () => {
    setSearch('');
    onClearFilters?.();
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Transaction History</h2>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by asset or type"
          className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:w-64"
        />
      </div>

      {isLoading ? (
        <div className="px-6 py-12 text-center text-sm text-slate-500">Loading transactions…</div>
      ) : showEmpty ? (
        <EmptyState
          icon={<Inbox className="h-6 w-6" aria-hidden="true" />}
          title="No transactions yet"
          description="Your deposits, borrows, and repayments will appear here once you get started."
          actionLabel="Make your first transaction"
          onAction={onCreateTransaction}
        />
      ) : showFilteredEmpty ? (
        <EmptyState
          icon={<SearchX className="h-6 w-6" aria-hidden="true" />}
          title="No matching transactions"
          description="We couldn't find any transactions matching your search. Try adjusting your filters."
          actionLabel="Clear filters"
          onAction={handleClearFilters}
        />
      ) : (
        <ul className="divide-y divide-slate-100">
          {filtered.map((tx) => {
            const isIncoming = tx.type === 'deposit' || tx.type === 'repay';
            return (
              <li key={tx.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-full ${
                      isIncoming ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                    }`}
                  >
                    {isIncoming ? (
                      <ArrowDownLeft className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                    )}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-slate-800">{TYPE_LABELS[tx.type]}</p>
                    <p className="text-xs text-slate-500">{formatDate(tx.timestamp)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-slate-800">
                    {isIncoming ? '+' : '-'}
                    {formatAmount(tx.amount, tx.asset)}
                  </p>
                  {tx.status && (
                    <p className="text-xs capitalize text-slate-500">{tx.status}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {hasActiveFilters && !showEmpty && !showFilteredEmpty && (
        <div className="border-t border-slate-200 px-4 py-2 text-right">
          <button
            type="button"
            onClick={handleClearFilters}
            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
          >
            <X className="h-3 w-3" aria-hidden="true" />
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
};

export default TransactionHistory;
