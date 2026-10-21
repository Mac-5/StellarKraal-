import React, { useMemo } from 'react';

export interface HealthFactorProps {
  /** Current health factor value. Values >= 1 are safe, < 1 are at risk. */
  value: number | null | undefined;
  /** Upper bound used for the progress bar (safe maximum). Defaults to 2.0. */
  safeMax?: number;
  /** Threshold below which the position is considered at-risk. Defaults to 1.5. */
  atRiskThreshold?: number;
  /** Threshold below which the position is considered in liquidation. Defaults to 1.0. */
  liquidationThreshold?: number;
  /** Optional label override. */
  label?: string;
  className?: string;
}

type RiskLevel = 'safe' | 'at-risk' | 'liquidation' | 'unknown';

const RISK_COLORS: Record<RiskLevel, string> = {
  safe: '#16a34a',
  'at-risk': '#d97706',
  liquidation: '#dc2626',
  unknown: '#6b7280',
};

const RISK_LABELS: Record<RiskLevel, string> = {
  safe: 'Safe',
  'at-risk': 'At risk',
  liquidation: 'Liquidation',
  unknown: 'Unknown',
};

const TOOLTIP_TEXT =
  'The health factor measures how safe your loan is. A value of 1.0 or higher is safe; ' +
  'below 1.5 is at risk; below 1.0 your collateral may be liquidated.';

function resolveRisk(
  value: number | null | undefined,
  atRiskThreshold: number,
  liquidationThreshold: number,
): RiskLevel {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'unknown';
  }
  if (value < liquidationThreshold) {
    return 'liquidation';
  }
  if (value < atRiskThreshold) {
    return 'at-risk';
  }
  return 'safe';
}

export const HealthFactor: React.FC<HealthFactorProps> = ({
  value,
  safeMax = 2.0,
  atRiskThreshold = 1.5,
  liquidationThreshold = 1.0,
  label = 'Health Factor',
  className,
}) => {
  const risk = useMemo(
    () => resolveRisk(value, atRiskThreshold, liquidationThreshold),
    [value, atRiskThreshold, liquidationThreshold],
  );

  const color = RISK_COLORS[risk];

  const progress = useMemo(() => {
    if (value === null || value === undefined || Number.isNaN(value) || safeMax <= 0) {
      return 0;
    }
    const clamped = Math.max(0, Math.min(value, safeMax));
    return (clamped / safeMax) * 100;
  }, [value, safeMax]);

  const displayValue =
    value === null || value === undefined || Number.isNaN(value)
      ? '—'
      : value.toFixed(2);

  return (
    <div
      className={className}
      style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 180 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 13, color: '#6b7280' }}>{label}</span>
        <span
          tabIndex={0}
          role="img"
          aria-label={TOOLTIP_TEXT}
          title={TOOLTIP_TEXT}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 16,
            height: 16,
            borderRadius: '50%',
            border: '1px solid #9ca3af',
            color: '#6b7280',
            fontSize: 11,
            cursor: 'help',
            outline: 'none',
          }}
        >
          i
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span
          style={{ fontSize: 22, fontWeight: 600, color }}
          aria-live="polite"
        >
          {displayValue}
        </span>
        <span style={{ fontSize: 12, fontWeight: 500, color }}>
          {RISK_LABELS[risk]}
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={value ?? 0}
        aria-label={`${label} progress`}
        style={{
          position: 'relative',
          height: 8,
          width: '100%',
          borderRadius: 4,
          background: '#e5e7eb',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${progress}%`,
            borderRadius: 4,
            background: color,
            transition: 'width 300ms ease, background-color 300ms ease',
          }}
        />
      </div>
    </div>
  );
};

export default HealthFactor;
