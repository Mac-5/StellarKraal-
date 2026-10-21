'use client';

import React from 'react';
import Link from 'next/link';

interface Loan {
  id: string;
  amount: number;
  status: string;
  createdAt?: string;
}

interface LoansListProps {
  loans: Loan[];
  isLoading?: boolean;
}

function EmptyLoansIllustration() {
  return (
    <svg
      width="160"
      height="120"
      viewBox="0 0 160 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className="text-gray-400 dark:text-gray-500"
    >
      <rect
        x="20"
        y="24"
        width="120"
        height="72"
        rx="8"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="6 6"
      />
      <circle cx="80" cy="60" r="18" stroke="currentColor" strokeWidth="2" />
      <path
        d="M80 50v20M70 60h20"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function LoansList({ loans, isLoading = false }: LoansListProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-500 dark:text-gray-400">
        Loading loans…
      </div>
    );
  }

  if (!loans || loans.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-gray-300 py-12 px-6 text-center dark:border-gray-700"
        role="status"
        aria-live="polite"
      >
        <EmptyLoansIllustration />
        <div>
          <p className="text-base font-medium text-gray-900 dark:text-gray-100">
            No loans yet
          </p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            You have not requested any loans. Get started by requesting your first loan.
          </p>
        </div>
        <Link
          href="/loans/request"
          className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
        >
          Request your first loan
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        <thead className="bg-gray-50 dark:bg-gray-800">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
              ID
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Amount
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
          {loans.map((loan) => (
            <tr key={loan.id}>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                {loan.id}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                {loan.amount}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                {loan.status}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
