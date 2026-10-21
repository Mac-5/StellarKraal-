import { forwardRef } from 'react';

interface AccessibleErrorMessageProps {
  /** Unique id used to link the message to its field via aria-describedby. */
  id: string;
  /** Error message to render. When falsy, nothing is rendered. */
  message?: string | null;
  /** Optional additional class names. */
  className?: string;
}

/**
 * Consistent, accessible error message rendered beneath a form field.
 *
 * Intended for use with react-hook-form + Zod: pass the field's error message
 * and an id that is referenced by the field's `aria-describedby` attribute.
 */
export const AccessibleErrorMessage = forwardRef<
  HTMLParagraphElement,
  AccessibleErrorMessageProps
>(({ id, message, className }, ref) => {
  if (!message) {
    return null;
  }

  return (
    <p
      ref={ref}
      id={id}
      role="alert"
      aria-live="polite"
      className={['mt-1 text-sm text-red-600', className]
        .filter(Boolean)
        .join(' ')}
    >
      {message}
    </p>
  );
});

AccessibleErrorMessage.displayName = 'AccessibleErrorMessage';

export default AccessibleErrorMessage;
