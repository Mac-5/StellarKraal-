import type { ReactNode } from "react";

type EmptyStateIllustration = "loans" | "collateral";

interface EmptyStateProps {
  illustration: EmptyStateIllustration;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionHref?: string;
  children?: ReactNode;
}

function LoansIllustration() {
  return (
    <svg
      role="img"
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 160 120"
      className="h-32 w-auto text-slate-400 dark:text-slate-500"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="24"
        y="20"
        width="112"
        height="80"
        rx="8"
        stroke="currentColor"
        strokeWidth="2"
        className="opacity-60"
      />
      <path
        d="M40 44h80M40 60h56M40 76h40"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="opacity-40"
      />
      <circle
        cx="112"
        cy="84"
        r="18"
        className="fill-white dark:fill-slate-900"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M112 76v16M104 84h16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CollateralIllustration() {
  return (
    <svg
      role="img"
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 160 120"
      className="h-32 w-auto text-slate-400 dark:text-slate-500"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M80 20l44 20v28c0 22-18 36-44 44-26-8-44-22-44-44V40l44-20z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        className="opacity-60"
      />
      <path
        d="M62 62l12 12 24-24"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="opacity-40"
      />
    </svg>
  );
}

const ILLUSTRATIONS: Record<EmptyStateIllustration, () => JSX.Element> = {
  loans: LoansIllustration,
  collateral: CollateralIllustration,
};

export default function EmptyState({
  illustration,
  title,
  description,
  actionLabel,
  onAction,
  actionHref,
  children,
}: EmptyStateProps) {
  const Illustration = ILLUSTRATIONS[illustration];

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-slate-300 px-6 py-12 text-center dark:border-slate-700"
    >
      <Illustration />
      <div className="space-y-1">
        <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {title}
        </p>
        {description ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {description}
          </p>
        ) : null}
      </div>
      {actionLabel && actionHref ? (
        <a
          href={actionHref}
          className="inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
        >
          {actionLabel}
        </a>
      ) : actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
        >
          {actionLabel}
        </button>
      ) : null}
      {children}
    </div>
  );
}
