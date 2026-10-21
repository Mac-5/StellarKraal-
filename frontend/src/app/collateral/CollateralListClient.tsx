'use client';
import { Suspense, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import SearchFilterBar from '@/components/SearchFilterBar';
import HighlightText from '@/components/HighlightText';
import PageTransition from '@/components/PageTransition';
import ScrollToTopButton from '@/components/ScrollToTopButton';
import { useScrollPosition } from '@/hooks/useScrollPosition';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import MoneyAmount from '@/components/MoneyAmount';
import Spinner from '@/components/Spinner';
// i18n — Issue #1207
import { useI18n } from '@/context/I18nContext';

interface Collateral {
  id: string;
  owner: string;
  animal_type: string;
  count: number;
  appraised_value: number;
}

const STATUS_OPTIONS: string[] = [];
const TYPE_OPTIONS = ['cattle', 'goat', 'sheep', 'pig', 'poultry'];
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const PAGE_SIZE = 20;

function CollateralListContent() {
  const searchParams = useSearchParams();
  const { t } = useI18n();

  const q = (searchParams.get('q') ?? '').toLowerCase();
  const types = searchParams.getAll('type');

  /**
   * Fetch a page of collateral items from the backend.
   * Falls back gracefully if the server doesn't support pagination — in that
   * case the entire list is returned on page 1 and hasMore becomes false.
   */
  const fetchPage = useCallback(
    async (page: number, pageSize: number): Promise<Collateral[]> => {
      const url = new URL(`${API}/api/collateral`);
      url.searchParams.set('page', String(page));
      url.searchParams.set('limit', String(pageSize));
      // Forward active type filters so the server can pre-filter when supported
      types.forEach((type) => url.searchParams.append('type', type));
      if (q) url.searchParams.set('q', q);

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      // API may return { items: [...] } or a plain array
      return Array.isArray(data) ? data : (data.items ?? []);
    },
    // Re-fetch from page 1 whenever filters change
    [q, types.join(',')]
  );

  const { items, loading, hasMore, error, sentinelRef } = useInfiniteScroll<Collateral>({
    fetchPage,
    pageSize: PAGE_SIZE,
  });

  // Client-side filtering — applied on top of server-side when server doesn't
  // support filtering, or as a refinement when it does.
  const filtered = items.filter((col) => {
    const matchesQuery =
      !q ||
      col.id.toLowerCase().includes(q) ||
      col.owner.toLowerCase().includes(q) ||
      col.animal_type.toLowerCase().includes(q);
    const matchesType = types.length === 0 || types.includes(col.animal_type);
    return matchesQuery && matchesType;
  });

  const initialLoading = loading && items.length === 0;

  return (
    <div className="space-y-4">
      <SearchFilterBar
        statusOptions={STATUS_OPTIONS}
        typeOptions={TYPE_OPTIONS}
        searchPlaceholder={t(
          'collateral.searchPlaceholder',
          'Search by ID, owner, or animal type…'
        )}
      />
      {initialLoading ? (
        <ul
          className="space-y-3"
          aria-busy="true"
          aria-label={t('collateral.loading', 'Loading collateral')}
        >
          {[...Array(5)].map((_, i) => (
            <li
              key={i}
              className="bg-white dark:bg-brown-900 rounded-xl p-4 shadow-sm border border-brown/10 flex justify-between items-center gap-3"
              aria-hidden="true"
            >
              <div className="space-y-2 min-w-0">
                <div className="skeleton-shimmer rounded h-4 w-28 sm:w-36" />
                <div className="skeleton-shimmer rounded h-3 w-32 sm:w-44" />
              </div>
              <div className="text-right space-y-2">
                <div className="skeleton-shimmer rounded h-4 w-20" />
                <div className="skeleton-shimmer rounded h-3 w-24 sm:w-28" />
              </div>
            </li>
          ))}
        </ul>
      ) : error && items.length === 0 ? (
        <p role="alert" className="text-error-dark text-sm">
          {t('collateral.loadError', 'Could not load collateral. Please try again.')}
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-brown/60 text-sm">
          {t('collateral.noResults', 'No collateral matches your filters.')}
        </p>
      ) : (
        <>
          <ul className="space-y-2" aria-label="Collateral list" aria-live="polite">
            {filtered.map((col) => (
              <li
                key={col.id}
                className="bg-white dark:bg-brown-900 rounded-xl p-4 shadow-sm border border-brown/10 flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-brown text-sm capitalize">
                    <HighlightText text={col.animal_type} query={q} /> — {col.count}{' '}
                    {t('common.head', 'head')}
                  </p>
                  <p className="text-xs text-brown/60 truncate">
                    <HighlightText text={col.owner} query={q} />
                  </p>
                </div>
                <div className="sm:text-right shrink-0">
                  <p className="text-sm font-medium text-brown dark:text-cream-50">
                    <MoneyAmount value={col.appraised_value} fromStroops interactive={false} />
                  </p>
                  <p className="text-xs text-brown/50">
                    {t('collateral.id', 'ID')}: <HighlightText text={col.id} query={q} />
                  </p>
                </div>
              </li>
            ))}
          </ul>

          {/* Sentinel observed by useInfiniteScroll to load the next page */}
          {hasMore && <div ref={sentinelRef} aria-hidden="true" className="h-1" />}

          {/* Loading spinner shown while fetching the next page */}
          {loading && (
            <div
              className="flex justify-center py-4"
              role="status"
              aria-label="Loading more collateral"
            >
              <Spinner className="h-6 w-6 text-brown" label="Loading more collateral" />
            </div>
          )}

          {/* End-of-list message when all records have been loaded */}
          {!hasMore && !loading && (
            <p className="text-center text-xs text-brown/40 py-4" role="status" aria-live="polite">
              {t('collateral.endOfList', "You've reached the end of the list.")}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default function CollateralListClient() {
  useScrollPosition();
  const { t } = useI18n();

  return (
    <PageTransition>
      <main className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold text-brown mb-6">
          {t('collateral.title', 'Collateral')}
        </h1>
        <Suspense
          fallback={
            <ul className="space-y-3 mt-4" aria-busy="true" aria-label="Loading collateral">
              {[...Array(5)].map((_, i) => (
                <li
                  key={i}
                  className="bg-white dark:bg-brown-900 rounded-xl p-4 shadow-sm border border-brown/10 flex justify-between items-center"
                  aria-hidden="true"
                >
                  <div className="space-y-2">
                    <div className="skeleton-shimmer rounded h-4 w-36" />
                    <div className="skeleton-shimmer rounded h-3 w-44" />
                  </div>
                  <div className="text-right space-y-2">
                    <div className="skeleton-shimmer rounded h-4 w-20" />
                    <div className="skeleton-shimmer rounded h-3 w-28" />
                  </div>
                </li>
              ))}
            </ul>
          }
        >
          <CollateralListContent />
        </Suspense>
      </main>
      <ScrollToTopButton />
    </PageTransition>
  );
}
