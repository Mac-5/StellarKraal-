import React, { useId, useState } from 'react';

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  placement?: 'top' | 'bottom';
}

/**
 * Lightweight accessible tooltip.
 * Shows on hover and on keyboard focus (focus-within), and is announced
 * to assistive technology via aria-describedby.
 */
export function Tooltip({ content, children, className, placement = 'top' }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();

  const positionClasses =
    placement === 'bottom'
      ? 'top-full mt-2'
      : 'bottom-full mb-2';

  return (
    <span
      className={`relative inline-flex ${className ?? ''}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span aria-describedby={open ? id : undefined} className="inline-flex">
        {children}
      </span>
      {open && (
        <span
          role="tooltip"
          id={id}
          className={`pointer-events-none absolute left-1/2 z-50 w-max max-w-xs -translate-x-1/2 rounded-md bg-gray-900 px-3 py-2 text-xs font-normal text-white shadow-lg transition-opacity duration-150 ${positionClasses}`}
        >
          {content}
        </span>
      )}
    </span>
  );
}

export default Tooltip;
