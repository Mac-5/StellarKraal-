'use client';

import React, { useState, useCallback, useId } from 'react';
import Card from '@/components/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/FormField';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import ScrollableTable from './ScrollableTable';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LiquidatorEntry {
  /** Stellar address of the approved liquidator. */
  address: string;
  /** ISO date string when the address was added. */
  addedAt: string;
}

export interface LiquidatorWhitelistProps {
  /** List of currently approved liquidators. */
  liquidators: LiquidatorEntry[];
  /** Called when the admin submits a new address to add. */
  onAdd: (address: string) => Promise<void>;
  /** Called when the admin requests removal of an address. */
  onRemove: (address: string) => Promise<void>;
  /** Whether the data is being loaded. */
  loading?: boolean;
  /** Optional error message to display. */
  error?: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Basic Stellar address validation (56-char G... or C... strings). */
function isValidStellarAddress(address: string): boolean {
  return /^[GC][A-Z2-7]{55}$/.test(address.trim());
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * LiquidatorWhitelist — admin panel component for managing the on-chain
 * liquidator whitelist.
 *
 * - When the list is empty, liquidation is open (any address).
 * - When at least one address is present, only listed addresses can liquidate.
 * - Supports light and dark mode via Tailwind `dark:` prefix.
 * - All interactive elements meet WCAG AA contrast requirements.
 */
export default function LiquidatorWhitelist({
  liquidators,
  onAdd,
  onRemove,
  loading = false,
  error = null,
}: LiquidatorWhitelistProps) {
  const [newAddress, setNewAddress] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [removingAddress, setRemovingAddress] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const { isOnline } = useNetworkStatus();

  const inputId = useId();
  const listId = useId();

  const handleAdd = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSuccessMessage(null);

      const trimmed = newAddress.trim();
      if (!trimmed) {
        setFieldError('Address is required.');
        return;
      }
      if (!isValidStellarAddress(trimmed)) {
        setFieldError('Enter a valid Stellar address (56 characters, starting with G or C).');
        return;
      }
      const duplicate = liquidators.some((l) => l.address === trimmed);
      if (duplicate) {
        setFieldError('This address is already on the whitelist.');
        return;
      }

      setFieldError(null);
      setSubmitting(true);
      try {
        await onAdd(trimmed);
        setNewAddress('');
        setSuccessMessage(`${trimmed.slice(0, 8)}…${trimmed.slice(-4)} added to whitelist.`);
      } catch (err: unknown) {
        setFieldError(err instanceof Error ? err.message : 'Failed to add address.');
      } finally {
        setSubmitting(false);
      }
    },
    [newAddress, liquidators, onAdd]
  );

  const handleRemove = useCallback(
    async (address: string) => {
      setSuccessMessage(null);
      setRemovingAddress(address);
      try {
        await onRemove(address);
        setSuccessMessage(`${address.slice(0, 8)}…${address.slice(-4)} removed from whitelist.`);
      } catch {
        /* errors surface via the parent's error prop */
      } finally {
        setRemovingAddress(null);
      }
    },
    [onRemove]
  );

  const isOpenMode = liquidators.length === 0;

  return (
    <section aria-labelledby="whitelist-heading">
      <Card
        header={
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h2
              id="whitelist-heading"
              className="text-xl font-semibold text-brown-800 dark:text-cream-100"
            >
              Liquidator Whitelist
            </h2>
            <span
              className={[
                'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold',
                isOpenMode
                  ? 'bg-success-light text-success-dark dark:bg-success/20 dark:text-green-300'
                  : 'bg-gold-100 text-gold-700 dark:bg-gold-900/30 dark:text-gold-300',
              ].join(' ')}
              aria-live="polite"
            >
              {isOpenMode
                ? 'Open liquidation (no restrictions)'
                : `${liquidators.length} approved liquidator${liquidators.length !== 1 ? 's' : ''}`}
            </span>
          </div>
        }
      >
        {/* Status banner */}
        <p className="text-sm text-brown-600 dark:text-cream-300 mb-6">
          {isOpenMode
            ? 'The whitelist is empty — any address can currently liquidate undercollateralised loans. Add at least one address below to restrict liquidation access.'
            : 'Only the addresses listed below are authorised to liquidate loans. Removing all addresses restores open liquidation.'}
        </p>

        {/* Global error */}
        {error && (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-error/30 bg-error-light px-4 py-3 text-sm text-error-dark dark:bg-error/10 dark:text-red-300"
          >
            {error}
          </div>
        )}

        {/* Success message */}
        {successMessage && (
          <div
            role="status"
            aria-live="polite"
            className="mb-4 rounded-xl border border-success/30 bg-success-light px-4 py-3 text-sm text-success-dark dark:bg-success/10 dark:text-green-300"
          >
            {successMessage}
          </div>
        )}

        {/* Add liquidator form */}
        <form onSubmit={handleAdd} aria-label="Add liquidator" className="mb-8" noValidate>
          <div className="flex gap-3 items-start flex-wrap sm:flex-nowrap">
            <div className="flex-1 min-w-0">
              <Input
                id={inputId}
                label="Stellar address"
                placeholder="G... or C..."
                value={newAddress}
                onChange={(e) => {
                  setNewAddress(e.target.value);
                  if (fieldError) setFieldError(null);
                  if (successMessage) setSuccessMessage(null);
                }}
                error={fieldError ?? undefined}
                disabled={submitting || loading}
                aria-required="true"
                autoComplete="off"
                spellCheck={false}
                maxLength={56}
              />
            </div>
            <div className="pt-7">
              <Button
                type="submit"
                variant="primary"
                loading={submitting}
                disabled={loading || !isOnline}
                title={!isOnline ? "You're offline" : undefined}
                aria-label="Add address to whitelist"
              >
                {!isOnline ? "You're offline" : submitting ? 'Adding…' : 'Add'}
              </Button>
            </div>
          </div>
        </form>

        {/* Whitelist table */}
        {loading ? (
          <div className="py-8 text-center" aria-busy="true" aria-label="Loading whitelist">
            <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-gold-500 border-t-transparent" />
          </div>
        ) : liquidators.length === 0 ? (
          <div
            id={listId}
            className="rounded-xl border-2 border-dashed border-brown-200 dark:border-brown-700 py-10 text-center"
            aria-label="Whitelist is empty"
          >
            <p className="text-sm text-brown-500 dark:text-cream-400">
              No approved liquidators yet.
            </p>
          </div>
        ) : (
          <ScrollableTable
            label="Approved liquidators table"
            className="rounded-xl border border-brown-100 dark:border-brown-700"
          >
            <table
              className="w-full text-sm"
              aria-label="Approved liquidators"
              aria-describedby={listId}
            >
              <caption id={listId} className="sr-only">
                List of approved liquidator addresses
              </caption>
              <thead className="bg-brown-50 dark:bg-brown-900/50">
                <tr>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-brown-600 dark:text-cream-400"
                  >
                    Address
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-brown-600 dark:text-cream-400"
                  >
                    Added
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-brown-600 dark:text-cream-400"
                  >
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brown-100 dark:divide-brown-700">
                {liquidators.map((entry) => (
                  <tr
                    key={entry.address}
                    className="transition-colors hover:bg-brown-50/50 dark:hover:bg-brown-800/30"
                  >
                    <td className="px-4 py-3 font-mono text-brown-800 dark:text-cream-100 break-all">
                      {entry.address}
                    </td>
                    <td className="px-4 py-3 text-brown-500 dark:text-cream-400 whitespace-nowrap">
                      {new Date(entry.addedAt).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleRemove(entry.address)}
                        loading={removingAddress === entry.address}
                        disabled={loading || removingAddress !== null}
                        aria-label={`Remove ${entry.address} from whitelist`}
                      >
                        {removingAddress === entry.address ? 'Removing…' : 'Remove'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableTable>
        )}
      </Card>
    </section>
  );
}
