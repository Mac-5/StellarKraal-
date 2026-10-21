'use client';

import { Suspense } from 'react';

import { Skeleton } from '@/components/ui/skeleton';

export interface Loan {
  id: string;
  borrower: string;
  principal: number;
  status: string;
  dueDate: string;
}

interface LoanTableProps {
  loans: Loan[];
}

const COLUMN_COUNT = 5;

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

export function LoanTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="w-full overflow-hidden rounded-lg border border-gray-200">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 font-medium text-gray-500">Borrower</th>
            <th className="px-4 py-3 font-medium text-gray-500">Principal</th>
            <th className="px-4 py-3 font-medium text-gray-500">Status</th>
            <th className="px-4 py-3 font-medium text-gray-500">Due Date</th>
            <th className="px-4 py-3 font-medium text-gray-500">Actions</th>
          </tr>
        </thead>
        <tbody className="animate-pulse">
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <tr key={rowIndex} className="border-t border-gray-100">
              {Array.from({ length: COLUMN_COUNT }).map((__, colIndex) => (
                <td key={colIndex} className="px-4 py-3">
                  <Skeleton className="h-4 w-full max-w-[8rem]" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LoanTableContent({ loans }: LoanTableProps) {
  if (loans.length === 0) {
    return (
      <div className="w-full rounded-lg border border-gray-200 p-8 text-center text-sm text-gray-500">
        No loans found.
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden rounded-lg border border-gray-200">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 font-medium text-gray-500">Borrower</th>
            <th className="px-4 py-3 font-medium text-gray-500">Principal</th>
            <th className="px-4 py-3 font-medium text-gray-500">Status</th>
            <th className="px-4 py-3 font-medium text-gray-500">Due Date</th>
            <th className="px-4 py-3 font-medium text-gray-500">Actions</th>
          </tr>
        </thead>
        <tbody>
          {loans.map((loan) => (
            <tr key={loan.id} className="border-t border-gray-100">
              <td className="px-4 py-3">{loan.borrower}</td>
              <td className="px-4 py-3">{formatCurrency(loan.principal)}</td>
              <td className="px-4 py-3">{loan.status}</td>
              <td className="px-4 py-3">{loan.dueDate}</td>
              <td className="px-4 py-3">
                <button
                  type="button"
                  className="text-sm font-medium text-blue-600 hover:text-blue-700"
                >
                  View
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function LoanTable({ loans }: LoanTableProps) {
  return (
    <Suspense fallback={<LoanTableSkeleton />}>
      <LoanTableContent loans={loans} />
    </Suspense>
  );
}
