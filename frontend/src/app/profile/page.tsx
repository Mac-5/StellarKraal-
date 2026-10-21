'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import PageTransition from '@/components/PageTransition';
import Card from '@/components/Card';
import StatusBadge from '@/components/StatusBadge';
import EmptyState from '@/components/EmptyState';
import MoneyAmount from '@/components/MoneyAmount';
import { useWallet } from '@/hooks/useWallet';
import { useToast } from '@/components/toast';
import { CharCount } from '@/components/ui';
import ScrollableTable from '@/components/ScrollableTable';

interface CollateralRecord {
  id: string;
  animal_type: string;
  count: number;
  appraised_value: number;
  status: string;
  createdAt: string;
}

interface LoanRecord {
  id: string;
  amount: number;
  status: string;
  health_factor?: number | null;
  createdAt: string;
}

interface BorrowerProfile {
  wallet: string;
  display_name?: string;
  collateral: CollateralRecord[];
  loans: LoanRecord[];
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const DISPLAY_NAME_MIN = 2;
const DISPLAY_NAME_MAX = 40;

export function buildReferralUrl(walletAddress: string): string {
  const base =
    typeof window !== 'undefined' ? window.location.origin : 'https://stellarkraal.example.com';
  return `${base}/register?ref=${walletAddress}`;
}

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {[...Array(4)].map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-brown-100 dark:bg-brown-700 rounded w-3/4" />
        </td>
      ))}
    </tr>
  );
}

/** Inline display-name editor */
function DisplayNameField({
  walletAddress,
  initialName,
  onSaved,
}: {
  walletAddress: string;
  initialName: string;
  onSaved: (name: string) => void;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when entering edit mode
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function validate(value: string): string | null {
    const trimmed = value.trim();
    if (trimmed.length < DISPLAY_NAME_MIN) {
      return `Name must be at least ${DISPLAY_NAME_MIN} characters.`;
    }
    if (trimmed.length > DISPLAY_NAME_MAX) {
      return `Name must be at most ${DISPLAY_NAME_MAX} characters.`;
    }
    return null;
  }

  function handleEdit() {
    setDraft(initialName);
    setValidationError(null);
    setEditing(true);
  }

  function handleCancel() {
    setEditing(false);
    setDraft(initialName);
    setValidationError(null);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setDraft(e.target.value);
    if (validationError) {
      setValidationError(validate(e.target.value));
    }
  }

  async function handleSave() {
    const err = validate(draft);
    if (err) {
      setValidationError(err);
      inputRef.current?.focus();
      return;
    }

    const trimmed = draft.trim();

    // Optimistic update
    onSaved(trimmed);
    setEditing(false);

    setSaving(true);
    try {
      const res = await fetch(`${API}/api/v1/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: walletAddress, display_name: trimmed }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Server error ${res.status}`);
      }
      toast.success('Display name saved successfully!');
    } catch (e: unknown) {
      // Rollback optimistic update
      onSaved(initialName);
      toast.error(
        e instanceof Error ? e.message : 'Failed to save display name. Please try again.'
      );
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void handleSave();
    }
    if (e.key === 'Escape') {
      handleCancel();
    }
  }

  if (editing) {
    return (
      <div>
        <dt className="text-brown-500 mb-1">Display Name</dt>
        <dd className="flex items-center gap-2 flex-wrap">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            maxLength={DISPLAY_NAME_MAX + 1}
            aria-label="Display name"
            aria-describedby={
              validationError
                ? 'display-name-error display-name-count'
                : 'display-name-help display-name-count'
            }
            aria-invalid={validationError ? 'true' : 'false'}
            className="rounded-lg border border-brown/30 px-3 py-1.5 text-sm text-brown-700 dark:bg-[#2A1A08] dark:text-cream focus:outline-none focus:ring-2 focus:ring-gold"
          />
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="text-xs font-semibold bg-gold text-brown rounded px-3 py-1.5 hover:bg-gold/80 transition disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={handleCancel}
            disabled={saving}
            className="text-xs font-medium text-brown-500 hover:text-brown-700 underline transition disabled:opacity-50"
          >
            Cancel
          </button>
          <div className="w-full flex items-start justify-between gap-3">
            {validationError ? (
              <p id="display-name-error" role="alert" className="text-xs text-red-600 mt-1">
                {validationError}
              </p>
            ) : (
              <p id="display-name-help" className="text-xs text-brown-500 mt-1">
                Up to {DISPLAY_NAME_MAX} characters. Press Enter to save, Esc to cancel.
              </p>
            )}
            <CharCount id="display-name-count" length={draft.length} max={DISPLAY_NAME_MAX} />
          </div>
        </dd>
      </div>
    );
  }

  return (
    <div>
      <dt className="text-brown-500 mb-1">Display Name</dt>
      <dd className="flex items-center gap-2">
        <span className="text-brown-700 dark:text-cream font-medium">
          {initialName || <span className="text-brown-400 italic">Not set</span>}
        </span>
        <button
          onClick={handleEdit}
          aria-label="Edit display name"
          className="text-xs font-medium text-gold hover:text-gold/80 underline transition"
        >
          Edit
        </button>
      </dd>
    </div>
  );
}

export default function ProfilePage() {
  const { address, freighterInstalled, connecting, connect } = useWallet();
  const [profile, setProfile] = useState<BorrowerProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    setError(null);
    fetch(`${API}/api/borrowers/${address}`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load profile');
        return r.json();
      })
      .then((data: BorrowerProfile) => {
        setProfile(data);
        setDisplayName(data.display_name ?? '');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [address]);

  async function handleCopy() {
    if (!address) return;
    await navigator.clipboard.writeText(buildReferralUrl(address));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!address) {
    return (
      <PageTransition>
        <main className="max-w-3xl mx-auto px-4 py-10">
          <h1 className="text-3xl font-bold text-brown-700 mb-6">My Profile</h1>
          <EmptyState
            icon="👛"
            heading="Wallet Not Connected"
            message="Connect your Freighter wallet to view your borrower profile."
            ctaLabel={
              freighterInstalled === false
                ? undefined
                : connecting
                  ? 'Connecting…'
                  : 'Connect Wallet'
            }
            onCta={freighterInstalled === false ? undefined : connect}
          />
          {freighterInstalled === false && (
            <p className="text-center text-sm mt-4">
              <a
                href="https://freighter.app"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gold underline"
              >
                Install Freighter
              </a>{' '}
              to connect your wallet.
            </p>
          )}
        </main>
      </PageTransition>
    );
  }

  const referralUrl = buildReferralUrl(address);

  return (
    <PageTransition>
      <main className="max-w-4xl mx-auto px-4 py-10 space-y-8">
        <h1 className="text-3xl font-bold text-brown-700">My Profile</h1>

        {/* Wallet Info */}
        <Card header={<h2 className="text-lg font-semibold text-brown-700">Wallet</h2>}>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-brown-500 mb-1">Address</dt>
              <dd className="font-mono break-all text-brown-700">{address}</dd>
            </div>
            <DisplayNameField
              walletAddress={address}
              initialName={displayName}
              onSaved={setDisplayName}
            />
          </dl>
        </Card>

        {/* Referral Section */}
        <Card header={<h2 className="text-lg font-semibold text-brown-700">Referral</h2>}>
          <p className="text-sm text-brown-600 mb-3">
            Share your referral link to invite others to StellarKraal.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-mono text-sm text-brown-700 break-all">{referralUrl}</span>
            <button
              onClick={() => void handleCopy()}
              className="text-sm font-semibold bg-gold text-brown rounded px-3 py-1.5 hover:bg-gold/80 transition shrink-0"
            >
              {copied ? 'Copied!' : 'Copy Invite Link'}
            </button>
          </div>
        </Card>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Collateral */}
        <section aria-labelledby="collateral-heading">
          <h2 id="collateral-heading" className="text-xl font-semibold text-brown-700 mb-3">
            Registered Collateral
          </h2>
          {loading ? (
            <Card>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-brown-500 border-b border-brown-100">
                    <th className="px-4 py-2">Species</th>
                    <th className="px-4 py-2">Count</th>
                    <th className="px-4 py-2">Value</th>
                    <th className="px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[...Array(2)].map((_, i) => (
                    <SkeletonRow key={i} />
                  ))}
                </tbody>
              </table>
            </Card>
          ) : profile?.collateral.length === 0 ? (
            <EmptyState
              icon="🐄"
              heading="No Collateral Registered"
              message="You haven't registered any livestock as collateral yet."
              ctaLabel="Register Collateral"
              onCta={() => window.location.assign('/collateral')}
            />
          ) : (
            <Card>
              <ScrollableTable label="Collateral table">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="text-left text-brown-500 border-b border-brown-100 dark:border-brown-700">
                      <th className="px-4 py-2 font-medium">Species</th>
                      <th className="px-4 py-2 font-medium">Count</th>
                      <th className="px-4 py-2 font-medium">Appraised Value</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brown-50 dark:divide-brown-800">
                    {profile?.collateral.map((col) => (
                      <tr key={col.id} className="hover:bg-brown-50/50 dark:hover:bg-brown-800/30">
                        <td className="px-4 py-3 capitalize font-medium text-brown-700">
                          {col.animal_type}
                        </td>
                        <td className="px-4 py-3 text-brown-600">{col.count}</td>
                        <td className="px-4 py-3 text-brown-600 dark:text-cream-50">
                          <MoneyAmount
                            value={col.appraised_value}
                            fromStroops
                            interactive={false}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={col.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollableTable>
            </Card>
          )}
        </section>

        {/* Loan History */}
        <section aria-labelledby="loans-heading">
          <h2 id="loans-heading" className="text-xl font-semibold text-brown-700 mb-3">
            Loan History
          </h2>
          {loading ? (
            <Card>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-brown-500 border-b border-brown-100">
                    <th className="px-4 py-2">Loan ID</th>
                    <th className="px-4 py-2">Amount</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {[...Array(2)].map((_, i) => (
                    <SkeletonRow key={i} />
                  ))}
                </tbody>
              </table>
            </Card>
          ) : profile?.loans.length === 0 ? (
            <EmptyState
              icon="📋"
              heading="No Loans Yet"
              message="You haven't taken out any loans. Register collateral and apply for a loan to get started."
              ctaLabel="Apply for a Loan"
              onCta={() => window.location.assign('/borrow')}
            />
          ) : (
            <Card>
              <ScrollableTable label="Loan history table">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="text-left text-brown-500 border-b border-brown-100 dark:border-brown-700">
                      <th className="px-4 py-2 font-medium">Loan ID</th>
                      <th className="px-4 py-2 font-medium">Amount</th>
                      <th className="px-4 py-2 font-medium">Health Factor</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                      <th className="px-4 py-2 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brown-50 dark:divide-brown-800">
                    {profile?.loans.map((loan) => (
                      <tr key={loan.id} className="hover:bg-brown-50/50 dark:hover:bg-brown-800/30">
                        <td className="px-4 py-3">
                          <Link
                            href={`/loans/${loan.id}`}
                            className="font-medium text-gold-600 hover:underline"
                          >
                            #{loan.id}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-brown-600 dark:text-cream-50">
                          <MoneyAmount value={loan.amount} fromStroops interactive={false} />
                        </td>
                        <td className="px-4 py-3 text-brown-600">
                          {loan.health_factor != null ? loan.health_factor.toFixed(2) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={loan.status} />
                        </td>
                        <td className="px-4 py-3 text-brown-500">
                          {new Date(loan.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollableTable>
            </Card>
          )}
        </section>
      </main>
    </PageTransition>
  );
}
