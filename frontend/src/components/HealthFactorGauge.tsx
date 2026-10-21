import { useEffect, useRef, useState } from 'react';

export interface HealthFactorGaugeProps {
  /** Health factor value. Values >= 1 are safe; < 1 risk liquidation. */
  healthFactor: number;
  /** Optional className for the outer wrapper. */
  className?: string;
}

interface Zone {
  key: 'liquidation' | 'atRisk' | 'safe';
  label: string;
  description: string;
  color: string;
  /** Upper bound (exclusive) of the zone on the normalized 0..1 scale. */
  max: number;
}

// Normalized scale: health factor 0 -> 0, 1 -> 0.5, 2+ -> 1.
const MAX_HF = 2;

const ZONES: Zone[] = [
  {
    key: 'liquidation',
    label: 'Liquidation',
    description: 'HF < 1.0 — collateral can be liquidated',
    color: '#ef4444',
    max: 0.5,
  },
  {
    key: 'atRisk',
    label: 'At Risk',
    description: '1.0 ≤ HF < 1.5 — close to liquidation',
    color: '#f59e0b',
    max: 0.75,
  },
  {
    key: 'safe',
    label: 'Safe',
    description: 'HF ≥ 1.5 — healthy position',
    color: '#22c55e',
    max: 1,
  },
];

function normalize(hf: number): number {
  if (!Number.isFinite(hf) || hf <= 0) return 0;
  return Math.min(hf / MAX_HF, 1);
}

function zoneFor(hf: number): Zone {
  if (!Number.isFinite(hf) || hf < 1) return ZONES[0];
  if (hf < 1.5) return ZONES[1];
  return ZONES[2];
}

export default function HealthFactorGauge({ healthFactor, className }: HealthFactorGaugeProps) {
  const [animated, setAnimated] = useState(normalize(healthFactor));
  const [showTooltip, setShowTooltip] = useState(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const target = normalize(healthFactor);
    const start = animated;
    const duration = 500;
    const startTime = performance.now();

    const step = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setAnimated(start + (target - start) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      }
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [healthFactor]);

  const zone = zoneFor(healthFactor);
  const percent = animated * 100;
  const displayValue = Number.isFinite(healthFactor) ? healthFactor.toFixed(2) : '—';

  return (
    <div className={className} style={{ position: 'relative', width: '100%', maxWidth: 360 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#6b7280' }}>Health Factor</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: zone.color }}>{displayValue}</span>
          <button
            type="button"
            aria-label="How is the health factor calculated?"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            onFocus={() => setShowTooltip(true)}
            onBlur={() => setShowTooltip(false)}
            onClick={() => setShowTooltip((v) => !v)}
            style={{
              width: 18,
              height: 18,
              borderRadius: '50%',
              border: '1px solid #9ca3af',
              background: 'transparent',
              color: '#6b7280',
              fontSize: 11,
              lineHeight: 1,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            i
          </button>
        </span>
      </div>

      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={MAX_HF}
        aria-valuenow={Number.isFinite(healthFactor) ? healthFactor : 0}
        aria-valuetext={`${displayValue} — ${zone.label}`}
        style={{
          position: 'relative',
          height: 12,
          borderRadius: 6,
          overflow: 'hidden',
          background: 'linear-gradient(to right, #ef4444 0%, #ef4444 50%, #f59e0b 50%, #f59e0b 75%, #22c55e 75%, #22c55e 100%)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -2,
            left: `calc(${percent}% - 2px)`,
            width: 4,
            height: 16,
            borderRadius: 2,
            background: '#111827',
            boxShadow: '0 0 0 2px #fff',
            transition: 'left 0.05s linear',
          }}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        {ZONES.map((z) => (
          <span
            key={z.key}
            title={z.description}
            style={{
              fontSize: 11,
              fontWeight: z.key === zone.key ? 700 : 500,
              color: z.key === zone.key ? z.color : '#9ca3af',
            }}
          >
            {z.label}
          </span>
        ))}
      </div>

      {showTooltip && (
        <div
          role="tooltip"
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 8,
            zIndex: 10,
            width: 260,
            padding: '10px 12px',
            borderRadius: 8,
            background: '#111827',
            color: '#f9fafb',
            fontSize: 12,
            lineHeight: 1.4,
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
          }}
        >
          The health factor is calculated as{' '}
          <strong>(collateral value × liquidation threshold) ÷ outstanding debt</strong>. A value of 1.0 or
          higher is safe; below 1.0 the position can be liquidated.
        </div>
      )}
    </div>
  );
}
