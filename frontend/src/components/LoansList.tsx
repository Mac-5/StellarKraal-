import React from 'react';

interface Loan {
  id: string;
  amount: number;
  status: string;
  borrower?: string;
}

interface LoansListProps {
  loans: Loan[];
  isLoading?: boolean;
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
  onCreateLoan?: () => void;
}

const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}> = ({ icon, title, description, primaryLabel, onPrimary, secondaryLabel, onSecondary }) => (
  <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white text-gray-400 shadow-sm">
      {icon}
    </div>
    <h3 className="text-base font-semibold text-gray-900">{title}</h3>
    <p className="mt-1 max-w-sm text-sm text-gray-500">{description}</p>
    <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
      <button
        type="button"
        onClick={onPrimary}
        className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
      >
        {primaryLabel}
      </button>
      {secondaryLabel && onSecondary && (
        <button
          type="button"
          onClick={onSecondary}
          className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          {secondaryLabel}
        </button>
      )}
    </div>
  </div>
);

const LoansIcon = () => (
  <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const SearchIcon = () => (
  <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
  </svg>
);

const LoansList: React.FC<LoansListProps> = ({
  loans,
  isLoading = false,
  hasActiveFilters = false,
  onClearFilters,
  onCreateLoan,
}) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-gray-500">
        Loading loans…
      </div>
    );
  }

  if (loans.length === 0) {
    if (hasActiveFilters) {
      return (
        <EmptyState
          icon={<SearchIcon />}
          title="No loans match your filters"
          description="Try adjusting your search or filters to find the loans you are looking for."
          primaryLabel="Clear filters"
          onPrimary={() => onClearFilters?.()}
          secondaryLabel="Create loan"
          onSecondary={onCreateLoan}
        />
      );
    }

    return (
      <EmptyState
        icon={<LoansIcon />}
        title="No loans yet"
        description="You have not created any loans. Get started by creating your first loan."
        primaryLabel="Create loan"
        onPrimary={() => onCreateLoan?.()}
      />
    );
  }

  return (
    <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
      {loans.map((loan) => (
        <li key={loan.id} className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm font-medium text-gray-900">Loan #{loan.id}</p>
            {loan.borrower && <p className="text-xs text-gray-500">{loan.borrower}</p>}
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-gray-900">{loan.amount}</p>
            <p className="text-xs text-gray-500">{loan.status}</p>
          </div>
        </li>
      ))}
    </ul>
  );
};

export default LoansList;
