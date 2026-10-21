import React from 'react';

export interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'full';
  'aria-label'?: string;
}

const roundedMap: Record<NonNullable<SkeletonProps['rounded']>, string> = {
  none: 'rounded-none',
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  full: 'rounded-full',
};

function toCssSize(value?: string | number): string | undefined {
  if (value === undefined) return undefined;
  return typeof value === 'number' ? `${value}px` : value;
}

/**
 * Base skeleton block with a shimmer animation consistent with the design system.
 * Reserves its own dimensions so real content can replace it without layout shift.
 */
export function Skeleton({
  className = '',
  width,
  height,
  rounded = 'md',
  'aria-label': ariaLabel,
}: SkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={ariaLabel ?? 'Loading content'}
      className={`skeleton-shimmer bg-gray-200 dark:bg-gray-700 ${roundedMap[rounded]} ${className}`}
      style={{ width: toCssSize(width), height: toCssSize(height) }}
    />
  );
}

/** Skeleton matching the dashboard layout (stat cards + chart area). */
export function DashboardSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading dashboard"
      className="space-y-6"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
            <Skeleton width="40%" height={12} aria-label="Loading stat label" />
            <div className="mt-3">
              <Skeleton width="60%" height={24} aria-label="Loading stat value" />
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
        <Skeleton width="30%" height={16} aria-label="Loading chart title" />
        <div className="mt-4">
          <Skeleton width="100%" height={240} aria-label="Loading chart" />
        </div>
      </div>
    </div>
  );
}

/** Skeleton matching the loan list layout (rows of loan entries). */
export function LoanListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading loans"
      className="divide-y divide-gray-200 rounded-lg border border-gray-200 dark:divide-gray-700 dark:border-gray-700"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4">
          <Skeleton width={40} height={40} rounded="full" aria-label="Loading loan avatar" />
          <div className="flex-1 space-y-2">
            <Skeleton width="45%" height={14} aria-label="Loading loan title" />
            <Skeleton width="30%" height={12} aria-label="Loading loan details" />
          </div>
          <Skeleton width={80} height={20} aria-label="Loading loan amount" />
        </div>
      ))}
    </div>
  );
}

/** Skeleton matching the collateral table layout (header + rows). */
export function CollateralTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading collateral"
      className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700"
    >
      <div className="flex gap-4 border-b border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex-1">
            <Skeleton width="70%" height={12} aria-label="Loading column header" />
          </div>
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex gap-4 border-b border-gray-200 p-4 last:border-b-0 dark:border-gray-700"
        >
          {Array.from({ length: 4 }).map((_, j) => (
            <div key={j} className="flex-1">
              <Skeleton width={j === 0 ? '80%' : '60%'} height={14} aria-label="Loading cell" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default Skeleton;
