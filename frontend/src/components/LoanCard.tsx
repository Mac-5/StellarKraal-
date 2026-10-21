import { useEffect, useRef, useState } from 'react';

interface LoanCardProps {
  healthFactor: number;
  collateral: number;
  debt: number;
  onRepay?: () => void;
  onBorrow?: () => void;
}

const SAFE_THRESHOLD = 2;
const AT_RISK_THRESHOLD = 1.2;
const MAX_GAUGE = 3;

function getZone(hf: number): { label: string; color: string } {
  if (hf >= SAFE_THRESHOLD) return { label: 'Safe', color: '#16a34a' };
  if (hf >= AT_RISK_THRESHOLD) return { label: 'At Risk', color: '#eab308' };
  return { label: 'Liquidation', color: '#dc2626' };
}

function HealthFactorGauge({ healthFactor }: { healthFactor: number }) {
  const [animated, setAnimated] = useState(0);
  const [showTooltip, setShowTooltip] = useState(false);
  const prevRef = useRef(0);

  useEffect(() => {
    const clamped = Math.max(0, Math.min(healthFactor, MAX_GAUGE));
    const start = prevRef.current;
    const startTime = performance.now();
    const duration = 600;
    let frame: number;

    const tick = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setAnimated(start + (clamped - start) * eased);
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        prevRef.current = clamped;
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [healthFactor]);

  const zone = getZone(healthFactor);
  const pct = (animated / MAX_GAUGE) * 100;
  const safePct = (SAFE_THRESHOLD / MAX_GAUGE) * 100;
  const atRiskPct = (AT_RISK_THRESHOLD / MAX_GAUGE) * 100;

  return (
    <div className="health-factor-gauge">
      <div className="health-factor-gauge__header">
        <span className="health-factor-gauge__label">
          Health Factor
          <button
            type="button"
            className="health-factor-gauge__info"
            aria-label="How is the health factor calculated?"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            onFocus={() => setShowTooltip(true)}
            onBlur={() => setShowTooltip(false)}
          >
            i
          </button>
        </span>
        <span className="health-factor-gauge__value" style={{ color: zone.color }}>
          {healthFactor.toFixed(2)} · {zone.label}
        </span>
      </div>

      {showTooltip && (
        <div className="health-factor-gauge__tooltip" role="tooltip">
          Health factor = (collateral value × liquidation threshold) ÷ debt value.
          A value below 1.0 means the loan can be liquidated. Values of 1.2 or
          higher are at risk, and 2.0 or higher are considered safe.
        </div>
      )}

      <div className="health-factor-gauge__track" role="meter" aria-valuemin={0} aria-valuemax={MAX_GAUGE} aria-valuenow={healthFactor} aria-label="Health factor gauge">
        <div className="health-factor-gauge__zone health-factor-gauge__zone--liquidation" style={{ width: `${atRiskPct}%` }} />
        <div className="health-factor-gauge__zone health-factor-gauge__zone--at-risk" style={{ width: `${safePct - atRiskPct}%` }} />
        <div className="health-factor-gauge__zone health-factor-gauge__zone--safe" style={{ width: `${100 - safePct}%` }} />
        <div className="health-factor-gauge__marker" style={{ left: `${pct}%`, backgroundColor: zone.color }} />
      </div>

      <div className="health-factor-gauge__legend">
        <span className="health-factor-gauge__legend-item health-factor-gauge__legend-item--liquidation">Liquidation &lt; {AT_RISK_THRESHOLD}</span>
        <span className="health-factor-gauge__legend-item health-factor-gauge__legend-item--at-risk">At Risk {AT_RISK_THRESHOLD}–{SAFE_THRESHOLD}</span>
        <span className="health-factor-gauge__legend-item health-factor-gauge__legend-item--safe">Safe ≥ {SAFE_THRESHOLD}</span>
      </div>
    </div>
  );
}

export default function LoanCard({ healthFactor, collateral, debt, onRepay, onBorrow }: LoanCardProps) {
  return (
    <div className="loan-card">
      <HealthFactorGauge healthFactor={healthFactor} />

      <div className="loan-card__details">
        <div className="loan-card__detail">
          <span className="loan-card__detail-label">Collateral</span>
          <span className="loan-card__detail-value">{collateral.toLocaleString()}</span>
        </div>
        <div className="loan-card__detail">
          <span className="loan-card__detail-label">Debt</span>
          <span className="loan-card__detail-value">{debt.toLocaleString()}</span>
        </div>
      </div>

      <div className="loan-card__actions">
        {onBorrow && (
          <button type="button" className="loan-card__action" onClick={onBorrow}>
            Borrow
          </button>
        )}
        {onRepay && (
          <button type="button" className="loan-card__action" onClick={onRepay}>
            Repay
          </button>
        )}
      </div>
    </div>
  );
}
