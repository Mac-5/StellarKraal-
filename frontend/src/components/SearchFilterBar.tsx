'use client';
import { useSearchFilter } from '@/hooks/useSearchFilter';

interface Props {
  statusOptions: string[];
  typeOptions: string[];
  searchPlaceholder?: string;
  /** Maximum XLM amount for the range slider upper bound (default: 100 000) */
  maxAmount?: number;
}

/**
 * Reusable search + filter bar with debounced search, multi-select filter panel,
 * amount range slider, date range picker, active filter chips, and a clear-all button.
 *
 * Closes #526 — added amount range slider and wired to useSearchFilter.
 */
export default function SearchFilterBar({
  statusOptions,
  typeOptions,
  searchPlaceholder = 'Search…',
  maxAmount = 100_000,
}: Props) {
  const {
    filters,
    debouncedQuery,
    setQuery,
    toggleStatus,
    toggleType,
    setDateFrom,
    setDateTo,
    setAmountMin,
    setAmountMax,
    removeStatus,
    removeType,
    clearAll,
    hasActiveFilters,
  } = useSearchFilter();

  const amountMinNum = filters.amountMin ? Number(filters.amountMin) : 0;
  const amountMaxNum = filters.amountMax ? Number(filters.amountMax) : maxAmount;

  return (
    <div className="space-y-3">
      {/* Search input */}
      <div className="flex gap-2">
        <input
          type="search"
          aria-label="Search"
          placeholder={searchPlaceholder}
          value={filters.query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 border border-brown/30 rounded-lg px-3 py-2 text-sm bg-white dark:bg-brown-900 dark:border-brown-600 focus:outline-none focus:ring-2 focus:ring-gold"
        />
        {hasActiveFilters && (
          <button
            onClick={clearAll}
            className="text-sm text-brown/60 hover:text-brown px-3 py-2 rounded-lg border border-brown/20 hover:border-brown/40 transition"
            aria-label="Clear all filters"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Filter panel */}
      <div className="flex flex-wrap gap-4">
        {statusOptions.length > 0 && (
          <fieldset>
            <legend className="text-xs font-semibold text-brown/60 uppercase tracking-wide mb-1">
              Status
            </legend>
            <div className="flex flex-wrap gap-1">
              {statusOptions.map((s) => (
                <button
                  key={s}
                  onClick={() => toggleStatus(s)}
                  aria-pressed={filters.statuses.includes(s)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition capitalize ${
                    filters.statuses.includes(s)
                      ? 'bg-brown text-cream border-brown'
                      : 'bg-white dark:bg-brown-900 text-brown dark:text-cream border-brown/30 hover:border-brown/60'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {typeOptions.length > 0 && (
          <fieldset>
            <legend className="text-xs font-semibold text-brown/60 uppercase tracking-wide mb-1">
              Type
            </legend>
            <div className="flex flex-wrap gap-1">
              {typeOptions.map((t) => (
                <button
                  key={t}
                  onClick={() => toggleType(t)}
                  aria-pressed={filters.types.includes(t)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
                    filters.types.includes(t)
                      ? 'bg-gold text-brown border-gold'
                      : 'bg-white dark:bg-brown-900 text-brown dark:text-cream border-brown/30 hover:border-brown/60'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {/* Amount range slider */}
        <fieldset className="w-full min-w-0 flex-1 sm:w-auto sm:min-w-[240px]">
          <legend className="text-xs font-semibold text-brown/60 uppercase tracking-wide mb-1">
            Amount range (XLM)
          </legend>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-brown/60">
              <span>{amountMinNum.toLocaleString()} XLM</span>
              <span>{amountMaxNum.toLocaleString()} XLM</span>
            </div>
            {/* Min slider */}
            <div className="relative">
              <label className="sr-only" htmlFor="amount-min">
                Minimum loan amount
              </label>
              <input
                id="amount-min"
                type="range"
                min={0}
                max={maxAmount}
                step={100}
                value={amountMinNum}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  // Prevent min exceeding max
                  if (val <= amountMaxNum) {
                    setAmountMin(val === 0 ? '' : String(val));
                  }
                }}
                className="w-full accent-gold cursor-pointer"
                aria-label={`Minimum amount: ${amountMinNum.toLocaleString()} XLM`}
                aria-valuemin={0}
                aria-valuemax={maxAmount}
                aria-valuenow={amountMinNum}
              />
            </div>
            {/* Max slider */}
            <div className="relative">
              <label className="sr-only" htmlFor="amount-max">
                Maximum loan amount
              </label>
              <input
                id="amount-max"
                type="range"
                min={0}
                max={maxAmount}
                step={100}
                value={amountMaxNum}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  // Prevent max going below min
                  if (val >= amountMinNum) {
                    setAmountMax(val === maxAmount ? '' : String(val));
                  }
                }}
                className="w-full accent-gold cursor-pointer"
                aria-label={`Maximum amount: ${amountMaxNum.toLocaleString()} XLM`}
                aria-valuemin={0}
                aria-valuemax={maxAmount}
                aria-valuenow={amountMaxNum}
              />
            </div>
            {/* Numeric inputs for precise control */}
            <div className="flex gap-2 items-center">
              <input
                type="number"
                min={0}
                max={amountMaxNum}
                step={100}
                placeholder="Min"
                value={filters.amountMin}
                onChange={(e) => setAmountMin(e.target.value)}
                aria-label="Minimum amount in XLM"
                className="w-24 border border-brown/30 rounded-lg px-2 py-1 text-sm bg-white dark:bg-brown-900 dark:border-brown-600 focus:outline-none focus:ring-2 focus:ring-gold"
              />
              <span className="text-xs text-brown/50">to</span>
              <input
                type="number"
                min={amountMinNum}
                max={maxAmount}
                step={100}
                placeholder="Max"
                value={filters.amountMax}
                onChange={(e) => setAmountMax(e.target.value)}
                aria-label="Maximum amount in XLM"
                className="w-24 border border-brown/30 rounded-lg px-2 py-1 text-sm bg-white dark:bg-brown-900 dark:border-brown-600 focus:outline-none focus:ring-2 focus:ring-gold"
              />
            </div>
          </div>
        </fieldset>

        {/* Date range */}
        <fieldset>
          <legend className="text-xs font-semibold text-brown/60 uppercase tracking-wide mb-1">
            Date range
          </legend>
          <div className="flex items-center gap-2">
            <input
              type="date"
              aria-label="From date"
              value={filters.dateFrom}
              max={filters.dateTo || undefined}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border border-brown/30 rounded-lg px-2 py-1 text-sm bg-white dark:bg-brown-900 dark:border-brown-600 focus:outline-none focus:ring-2 focus:ring-gold"
            />
            <span className="text-xs text-brown/50">to</span>
            <input
              type="date"
              aria-label="To date"
              value={filters.dateTo}
              min={filters.dateFrom || undefined}
              onChange={(e) => setDateTo(e.target.value)}
              className="border border-brown/30 rounded-lg px-2 py-1 text-sm bg-white dark:bg-brown-900 dark:border-brown-600 focus:outline-none focus:ring-2 focus:ring-gold"
            />
          </div>
        </fieldset>
      </div>

      {/* Active filter chips */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2" aria-label="Active filters">
          {debouncedQuery && <Chip label={`"${debouncedQuery}"`} onRemove={() => setQuery('')} />}
          {filters.statuses.map((s) => (
            <Chip key={s} label={s} onRemove={() => removeStatus(s)} />
          ))}
          {filters.types.map((t) => (
            <Chip key={t} label={t} onRemove={() => removeType(t)} />
          ))}
          {filters.amountMin && (
            <Chip
              label={`Min: ${Number(filters.amountMin).toLocaleString()} XLM`}
              onRemove={() => setAmountMin('')}
            />
          )}
          {filters.amountMax && (
            <Chip
              label={`Max: ${Number(filters.amountMax).toLocaleString()} XLM`}
              onRemove={() => setAmountMax('')}
            />
          )}
          {filters.dateFrom && (
            <Chip label={`From: ${filters.dateFrom}`} onRemove={() => setDateFrom('')} />
          )}
          {filters.dateTo && (
            <Chip label={`To: ${filters.dateTo}`} onRemove={() => setDateTo('')} />
          )}
        </div>
      )}
    </div>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 bg-gold/20 text-brown text-xs font-medium px-2 py-1 rounded-full">
      {label}
      <button
        onClick={onRemove}
        aria-label={`Remove filter ${label}`}
        className="hover:text-brown/60 transition"
      >
        ×
      </button>
    </span>
  );
}
