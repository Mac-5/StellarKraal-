'use client';
/**
 * ScrollableTable — Issue #1415
 *
 * Wraps a wide <table> so it scrolls horizontally on small screens instead of
 * pushing the page wider than the viewport. While there is hidden content to
 * the right it shows a fade on the trailing edge and a "Swipe to see more"
 * hint, so users know the table continues.
 *
 * The container is focusable (tabIndex=0) with an accessible name so keyboard
 * users can scroll it with the arrow keys.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface ScrollableTableProps {
  children: React.ReactNode;
  /** Accessible name for the scroll region, e.g. "Loan history table". */
  label: string;
  /** Extra classes for the scroll container (borders, radius, shadow…). */
  className?: string;
}

export default function ScrollableTable({ children, label, className = '' }: ScrollableTableProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // 1px tolerance for sub-pixel rounding.
    setCanScrollRight(el.scrollWidth - el.clientWidth - el.scrollLeft > 1);
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;

    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    observer?.observe(el);
    if (el.firstElementChild) observer?.observe(el.firstElementChild);

    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      observer?.disconnect();
    };
  }, [update]);

  return (
    <div className="max-w-full">
      <div className="relative">
        <div
          ref={ref}
          role="region"
          aria-label={label}
          tabIndex={0}
          className={`overflow-x-auto overscroll-x-contain focus:outline-none focus-visible:ring-2 focus-visible:ring-gold ${className}`}
        >
          {children}
        </div>
        {/* Fade on the trailing edge hints that more columns are hidden */}
        {canScrollRight && (
          <div
            aria-hidden="true"
            data-testid="scroll-fade"
            className="pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-2xl bg-gradient-to-l from-black/10 to-transparent dark:from-black/40"
          />
        )}
      </div>
      {canScrollRight && (
        <p
          aria-hidden="true"
          className="mt-1 text-right text-xs text-brown-500 dark:text-brown-300"
        >
          Swipe to see more →
        </p>
      )}
    </div>
  );
}
