import React, { useId } from 'react';

export type HealthFactorRisk = 'safe' | 'at-risk' | 'liquidation';

export interface HealthFactorDisplayProps {
  /** Current health factor value. Values >= 1 are healthy; < 1 means liquidatable. */
  value: number;
  /** Upper bound used to scale the progress bar. Defaults to 2.0. */
  safeMax?: number;
  /** Optional label override. */
  label?: string;
  /** Optional className for the outer wrapper. */
  className?: string;
}

const DEFAULT_SAFE_MAX = 2.0;
const AT_RISK_THRESHOLD = 1.5;
const LIQUIDATION_THRESHOLD = 1.0;

const RISK_STYLES: Record<
  HealthFactorRisk,
  { text: string; bar: string; label: string }
> = {
  safe: {
    text: 'text-green-600',
    bar: 'bg-green-500',
    label: 'Safe',
  },
  'at-risk': {
    text: 'text-amber-500',
    bar: 'bg-amber-500',
    label: 'At risk',
  },
  liquidation: {
    text: 'text-red-600',
    bar: 'bg-red-500',
    label: 'Liquidation risk',
  },
};

const TOOLTIP_TEXT =
  'The health factor measures how safe your loan is. A value of 1.0 or below means your collateral can be liquidated. Higher values are safer.';

export function getHealthFactorRisk(value: number): HealthFactorRisk {
  if (!Number.isFinite(value) || value < LIQUIDATION_THRESHOLD) {
    return 'liquidation';
  }
  if (value < AT_RISK_THRESHOLD) {
    return 'at-risk';
  }
  return 'safe';
}

/**
 * Displays a loan health factor with risk colour coding, an animated
 * progress bar, and an accessible tooltip. Purely prop-driven so it
 * re-renders reactively whenever the loan state changes.
 */
export default function HealthFactorDisplay({
  value,
  safeMax = DEFAULT_SAFE_MAX,
  label = 'Health Factor',
  className = '',
}: HealthFactorDisplayProps) {
  const tooltipId = useId();
  const risk = getHealthFactorRisk(value);
  const styles = RISK_STYLES[risk];

  const boundedMax = safeMax > 0 ? safeMax : DEFAULT_SAFE_MAX;
  const clamped = Number.isFinite(value) ? Math.max(0, Math.min(value, boundedMax)) : 0;
  const percent = (clamped / boundedMax) * 100;
  const displayValue = Number.isFinite(value) ? value.toFixed(2) : '—';

  return (
    <div className={`flex flex-col gap-2 ${className}`.trim()}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span
          className={`group relative inline-flex items-center gap-1 text-sm font-semibold ${styles.text}`}
          tabIndex={0}
          aria-describedby={tooltipId}
        >
          {displayValue}
          <span
            aria-hidden="true"
            className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-current text-[10px] leading-none"
          >
            i
          </span>
          <span
            id={tooltipId}
            role="tooltip"
            className="pointer-events-none absolute bottom-full right-0 z-10 mb-2 w-56 rounded-md bg-gray-900 px-3 py-2 text-xs font-normal text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
          >
            {TOOLTIP_TEXT}
          </span>
        </span>
      </div>

      <div
        className="h-2 w-full overflow-hidden rounded-full bg-gray-200"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={boundedMax}
        aria-valuenow={Number.isFinite(value) ? value : 0}
        aria-valuetext={`${displayValue} (${styles.label})`}
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${styles.bar}`}
          style={{ width: `${percent}%` }}
        />
      </div>

      <span className={`text-xs font-medium ${styles.text}`}>{styles.label}</span>
    </div>
  );
}
