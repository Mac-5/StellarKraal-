import React, { useId } from 'react';

export interface HealthFactorDisplayProps {
  /** Current health factor value. Values >= 1 are safe, < 1 risk liquidation. */
  healthFactor: number;
  /** Upper bound used for the progress bar scale. Defaults to 2.0. */
  safeMax?: number;
  /** Optional className for layout tweaks by the consumer. */
  className?: string;
}

type RiskLevel = 'safe' | 'at-risk' | 'liquidation';

const SAFE_THRESHOLD = 1.5;
const LIQUIDATION_THRESHOLD = 1.0;

const RISK_STYLES: Record<
  RiskLevel,
  { text: string; bar: string; label: string }
> = {
  safe: {
    text: 'text-green-600',
    bar: 'bg-green-500',
    label: 'Safe',
  },
  'at-risk': {
    text: 'text-amber-600',
    bar: 'bg-amber-500',
    label: 'At risk',
  },
  liquidation: {
    text: 'text-red-600',
    bar: 'bg-red-500',
    label: 'Liquidation risk',
  },
};

function getRiskLevel(healthFactor: number): RiskLevel {
  if (!Number.isFinite(healthFactor) || healthFactor < LIQUIDATION_THRESHOLD) {
    return 'liquidation';
  }
  if (healthFactor < SAFE_THRESHOLD) {
    return 'at-risk';
  }
  return 'safe';
}

const TOOLTIP_TEXT =
  'The health factor measures how safe your loan is. A value of 1.0 is the liquidation threshold; higher values mean more collateral buffer. Below 1.0 your position can be liquidated.';

export default function HealthFactorDisplay({
  healthFactor,
  safeMax = 2.0,
  className = '',
}: HealthFactorDisplayProps) {
  const tooltipId = useId();
  const risk = getRiskLevel(healthFactor);
  const styles = RISK_STYLES[risk];

  const displayValue = Number.isFinite(healthFactor)
    ? healthFactor.toFixed(2)
    : '—';

  const max = safeMax > 0 ? safeMax : 2.0;
  const clamped = Number.isFinite(healthFactor)
    ? Math.min(Math.max(healthFactor, 0), max)
    : 0;
  const percent = (clamped / max) * 100;

  return (
    <div className={`flex flex-col gap-2 ${className}`.trim()}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-gray-700">Health Factor</span>
        <span
          className={`group relative inline-flex items-center gap-1 text-lg font-semibold ${styles.text}`}
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
        aria-valuemax={max}
        aria-valuenow={Number.isFinite(healthFactor) ? healthFactor : 0}
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
