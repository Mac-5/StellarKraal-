'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { usePolling } from './usePolling';

const POLL_INTERVAL = 30_000;
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export type HealthFactorZone = 'safe' | 'at-risk' | 'liquidation';

export interface HealthFactorZoneInfo {
  zone: HealthFactorZone;
  label: string;
  description: string;
  color: string;
}

// Zone thresholds for the visual gauge.
// >= SAFE_THRESHOLD is safe, >= AT_RISK_THRESHOLD is at risk, below is liquidation.
export const SAFE_THRESHOLD = 1.5;
export const AT_RISK_THRESHOLD = 1.0;
// Upper bound used to normalize the gauge fill (values above are clamped).
export const GAUGE_MAX = 3.0;

export function getHealthFactorZone(value: number | null): HealthFactorZoneInfo {
  if (value === null || Number.isNaN(value)) {
    return {
      zone: 'safe',
      label: 'Unknown',
      description: 'Health factor unavailable',
      color: '#9ca3af',
    };
  }
  if (value >= SAFE_THRESHOLD) {
    return {
      zone: 'safe',
      label: 'Safe',
      description: 'Your position is healthy and well collateralized.',
      color: '#22c55e',
    };
  }
  if (value >= AT_RISK_THRESHOLD) {
    return {
      zone: 'at-risk',
      label: 'At Risk',
      description: 'Your position is close to the liquidation threshold.',
      color: '#eab308',
    };
  }
  return {
    zone: 'liquidation',
    label: 'Liquidation',
    description: 'Your position is eligible for liquidation.',
    color: '#ef4444',
  };
}

// Normalize a health factor into a 0-100 percentage for the gauge fill.
export function healthFactorToPercent(value: number | null): number {
  if (value === null || Number.isNaN(value)) return 0;
  const clamped = Math.max(0, Math.min(value, GAUGE_MAX));
  return (clamped / GAUGE_MAX) * 100;
}

export function useHealthFactor(loanId: string) {
  const [healthFactor, setHealthFactor] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  const fetch_ = useCallback(async () => {
    if (!loanId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/health/${loanId}`);
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      setHealthFactor(Number(data.health_factor ?? 0));
      setLastUpdated(new Date());
      setHasFetched(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to fetch health factor');
    } finally {
      setLoading(false);
    }
  }, [loanId]);

  usePolling(fetch_, POLL_INTERVAL);

  const lastUpdatedLabel = lastUpdated
    ? new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(
        -Math.floor((Date.now() - lastUpdated.getTime()) / 1000),
        'second'
      )
    : null;

  const zoneInfo = getHealthFactorZone(healthFactor);
  const gaugePercent = healthFactorToPercent(healthFactor);

  return {
    healthFactor,
    loading,
    error,
    lastUpdated,
    lastUpdatedLabel,
    hasFetched,
    refresh: fetch_,
    zoneInfo,
    gaugePercent,
  };
}
