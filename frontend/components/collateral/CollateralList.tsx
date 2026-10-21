'use client';

import { Suspense } from 'react';

interface CollateralItem {
  id: string;
  name: string;
  value: number;
  status: string;
}

interface CollateralListProps {
  items: CollateralItem[];
}

function CollateralListItemSkeleton() {
  return (
    <li className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 animate-pulse rounded-full bg-gray-200" />
        <div className="flex flex-col gap-2">
          <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
          <div className="h-3 w-20 animate-pulse rounded bg-gray-200" />
        </div>
      </div>
      <div className="flex flex-col items-end gap-2">
        <div className="h-4 w-16 animate-pulse rounded bg-gray-200" />
        <div className="h-5 w-14 animate-pulse rounded-full bg-gray-200" />
      </div>
    </li>
  );
}

export function CollateralListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <ul className="flex flex-col gap-3" aria-busy="true" aria-live="polite">
      {Array.from({ length: count }).map((_, index) => (
        <CollateralListItemSkeleton key={index} />
      ))}
    </ul>
  );
}

function CollateralListContent({ items }: CollateralListProps) {
  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-500">
        No collateral items found.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex items-center justify-between rounded-lg border border-gray-200 p-4"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-sm font-medium text-gray-600">
              {item.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-900">
                {item.name}
              </span>
              <span className="text-xs text-gray-500">
                ${item.value.toLocaleString()}
              </span>
            </div>
          </div>
          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
            {item.status}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function CollateralList({ items }: CollateralListProps) {
  return (
    <Suspense fallback={<CollateralListSkeleton />}>
      <CollateralListContent items={items} />
    </Suspense>
  );
}
