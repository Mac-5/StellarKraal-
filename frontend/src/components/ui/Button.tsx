'use client';
import { forwardRef } from 'react';
import Spinner from '@/components/Spinner';
import { useRipple } from '@/hooks/useRipple';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';
export type ButtonState = 'idle' | 'loading' | 'success' | 'error';

/**
 * Variant classes cover the full interactive state matrix (#1412):
 *  - hover:  `hover:*`
 *  - active: `active:*` (pressed feedback)
 *  - focus:  `focus-visible:ring-*` (WCAG 2.1 AA visible focus ring)
 *  - disabled: handled globally via `disabled:*` utilities below
 */
const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-brown-600 text-cream-50 hover:bg-brown-700 active:bg-brown-800 focus-visible:ring-gold-500',
  secondary:
    'bg-gold-600 text-cream-50 hover:bg-gold-700 active:bg-gold-800 focus-visible:ring-gold-500',
  ghost:
    'border-2 border-brown-300 text-brown-700 hover:border-brown-500 hover:bg-brown-50 active:bg-brown-100 focus-visible:ring-brown-400',
  danger:
    'bg-error text-white hover:bg-error-dark active:bg-error-dark focus-visible:ring-error',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-lg',
  md: 'px-5 py-2.5 text-sm rounded-xl',
  lg: 'px-6 py-3 text-base rounded-xl',
};

const stateClasses: Record<ButtonState, string> = {
  idle: '',
  loading: 'opacity-75 cursor-progress',
  success: 'bg-green-600 hover:bg-green-600 active:bg-green-600 text-white',
  error: 'bg-red-600 hover:bg-red-600 active:bg-red-600 text-white',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /**
   * @deprecated Use `isLoading` instead. Kept for backwards compatibility.
   * When `true`, the button shows a spinner and is disabled.
   */
  loading?: boolean;
  /**
   * Shows a spinner inside the button and prevents interaction.
   * Preserves the button's natural width to avoid layout shift.
   * Sets aria-busy="true" and aria-disabled="true".
   *
   * Closes #783
   */
  isLoading?: boolean;
  state?: ButtonState;
  /** Makes the button fill its container */
  fullWidth?: boolean;
}

/**
 * Button — primary interactive element.
 *
 * State system (#1412):
 *  - Every variant (primary, secondary, ghost, danger) defines hover, active,
 *    focus-visible, and disabled styling.
 *  - Focus uses a 2px `focus-visible` ring with a 2px offset, meeting WCAG 2.1
 *    AA focus-visible requirements (visible, high-contrast, keyboard-only).
 *  - Disabled buttons apply `opacity-50`, `cursor-not-allowed`, and suppress
 *    hover/active feedback so they read as non-interactive.
 *
 * Ripple effect (#809):
 *  - Primary-variant buttons show a white 30%-opacity ripple radiating from
 *    the pointer's click point (400 ms CSS animation via `.btn-ripple`).
 *  - The effect is disabled when `prefers-reduced-motion` is set — both in CSS
 *    (the `.ripple-wave` element is hidden) and in the JS hook (no DOM node
 *    is created).
 *  - The ripple does not fire when the button is disabled or loading.
 *
 * Loading state (#783):
 *  - `isLoading` or `loading` prop shows a Spinner, prevents clicks.
 *  - `aria-busy="true"` signals the loading state to assistive technology.
 *  - `aria-disabled="true"` is set on both loading and disabled states so
 *    screen readers announce the restriction without removing the element
 *    from the accessibility tree (unlike the native `disabled` attribute on
 *    anchor-buttons). The native `disabled` attr is still applied to prevent
 *    form submission.
 *  - Children are wrapped in a `<span>` that stays in the DOM at full opacity,
 *    so the button width never collapses while the spinner is shown.
 *
 * Disabled state (#783):
 *  - `disabled` prop applies `opacity-50` and `cursor-not-allowed` via Tailwind.
 *  - `aria-disabled="true"` mirrors the visual state for assistive technology.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    isLoading = false,
    state = 'idle',
    fullWidth = false,
    disabled,
    children,
    className = '',
    onPointerDown,
    ...props
  },
  ref
) {
  // Unify the two loading props
  const isLoadingActive = isLoading || loading || state === 'loading';
  const isDisabled = disabled || isLoadingActive;

  const showSuccess = state === 'success';
  const showError = state === 'error';

  // Ripple is only applied to primary buttons — it looks best on a solid
  // coloured background. For other variants the class is omitted so the
  // overflow:hidden required by the ripple doesn't clip e.g. ghost focus rings.
  const { triggerRipple } = useRipple();
  const isPrimary = state === 'idle' && variant === 'primary';

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (isPrimary && !isDisabled) triggerRipple(e);
    onPointerDown?.(e);
  };

  return (
    <button
      ref={ref}
      disabled={isDisabled}
      aria-busy={isLoadingActive || undefined}
      aria-disabled={isDisabled || undefined}
      onPointerDown={handlePointerDown}
      className={[
        'inline-flex items-center justify-center gap-2 font-semibold transition',
        // Focus-visible ring: 2px ring + 2px offset for WCAG 2.1 AA visibility
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        'focus-visible:ring-[color:var(--token-accent)]',
        // Disabled: dim, non-interactive cursor, and no hover/active feedback
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'disabled:hover:bg-inherit disabled:active:bg-inherit',
        // Ripple class adds `position:relative; overflow:hidden` for primary only
        isPrimary ? 'btn-ripple' : '',
        state === 'idle' ? variantClasses[variant] : '',
        stateClasses[state],
        sizeClasses[size],
        fullWidth ? 'w-full' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {/* Spinner — shown when loading; uses Spinner component for consistency */}
      {isLoadingActive && (
        <Spinner className="h-4 w-4 shrink-0" label="Loading" />
      )}

      {/* Success icon */}
      {showSuccess && !isLoadingActive && (
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M20 6L9 17l-5-5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}

      {/* Error icon */}
      {showError && !isLoadingActive && (
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
          <path d="M12 8v4m0 4v.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}

      {/*
       * Children are always rendered (even while loading) inside a span.
       * This preserves the button's intrinsic width and prevents layout shift
       * when the spinner replaces or accompanies the label.
       * The span is aria-hidden during loading so AT reads only the spinner label.
       */}
      <span aria-hidden={isLoadingActive || undefined}>{children}</span>
    </button>
  );
});
