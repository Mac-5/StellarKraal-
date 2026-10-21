import React from 'react';

interface EmptyStateProps {
  illustration?: React.ReactNode;
  heading: string;
  message: string;
  ctaLabel?: string;
  onCta?: () => void;
  icon?: string;
  /** When true, renders a secondary "Clear filters" action for filtered/searched results. */
  isFiltered?: boolean;
  onClearFilters?: () => void;
  clearFiltersLabel?: string;
}

export default function EmptyState({
  illustration,
  heading,
  message,
  ctaLabel,
  onCta,
  icon,
  isFiltered,
  onClearFilters,
  clearFiltersLabel = 'Clear filters',
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {/* Icon or illustration
          aria-hidden is intentionally removed here (#780): illustrations now
          carry their own role="img" + aria-label and must not be hidden. */}
      <div className="mb-6 text-6xl text-brown/30 flex items-center justify-center">
        {illustration || <span aria-hidden="true" className="text-5xl">{icon || '📭'}</span>}
      </div>

      {/* Heading */}
      <h3 className="text-xl font-semibold text-brown mb-2">{heading}</h3>

      {/* Message */}
      <p role="status" className="text-brown/70 mb-6 text-sm max-w-sm">
        {message}
      </p>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        {/* Primary CTA Button */}
        {ctaLabel && onCta && (
          <button
            onClick={onCta}
            className="bg-gold text-brown px-6 py-2.5 rounded-xl font-semibold hover:bg-gold/80 transition focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2"
          >
            {ctaLabel}
          </button>
        )}

        {/* Clear filters action for filtered/searched results */}
        {isFiltered && onClearFilters && (
          <button
            onClick={onClearFilters}
            className="bg-transparent text-brown px-6 py-2.5 rounded-xl font-semibold border border-brown/30 hover:bg-brown/5 transition focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2"
          >
            {clearFiltersLabel}
          </button>
        )}
      </div>
    </div>
  );
}
