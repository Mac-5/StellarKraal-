'use client';
import { forwardRef, useId } from 'react';

// Shared base classes for all input-like elements
export const inputBase =
  'w-full rounded-xl border px-4 py-3 text-brown-700 placeholder-brown-500 bg-white ' +
  'transition focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold ' +
  'disabled:bg-brown-50 disabled:text-brown-400 disabled:cursor-not-allowed';

export const inputIdle = 'border-brown-300';
export const inputError = 'border-error focus:ring-error/30 focus:border-error';
export const inputSuccess = 'border-success focus:ring-success/30 focus:border-success';

/** Picks the border style for the current validation state. */
function stateClass(error?: string, success?: boolean) {
  if (error) return inputError;
  if (success) return inputSuccess;
  return inputIdle;
}

/** Joins the ids of whichever description elements are rendered. */
function describedBy(...ids: Array<string | false | undefined>) {
  const joined = ids.filter(Boolean).join(' ');
  return joined || undefined;
}

// ── HelperText ───────────────────────────────────────────────────────────────

/** Short hint below a field describing the expected format or constraints. */
export function HelperText({ id, children }: { id?: string; children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} className="mt-1 text-xs text-brown-500 dark:text-brown-300">
      {children}
    </p>
  );
}

// ── CharCount ────────────────────────────────────────────────────────────────

/** "12 / 50" counter for fields with a length limit. Turns red when over the limit. */
export function CharCount({ id, length, max }: { id?: string; length: number; max: number }) {
  const over = length > max;
  const near = !over && length >= max * 0.9;
  return (
    <p
      id={id}
      aria-live="polite"
      className={`mt-1 text-xs tabular-nums ${
        over
          ? 'text-error-dark font-medium'
          : near
            ? 'text-warning-dark'
            : 'text-brown-500 dark:text-brown-300'
      }`}
    >
      <span className="sr-only">Characters used: </span>
      {length} / {max}
    </p>
  );
}

// ── FieldSuccess ─────────────────────────────────────────────────────────────

/** Trailing check icon shown inside a field once its value is valid. */
function InputSuccessIcon({
  className = 'inset-y-0 right-3 flex items-center',
}: {
  className?: string;
}) {
  return (
    <span aria-hidden="true" className={`pointer-events-none absolute text-success ${className}`}>
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M3 8.5l3.5 3.5L13 4.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/** Footer row under a field: helper text / error on the left, char count on the right. */
function FieldFooter({
  id,
  error,
  helperText,
  maxLength,
  showCharCount,
  length,
}: {
  id: string;
  error?: string;
  helperText?: React.ReactNode;
  maxLength?: number;
  showCharCount?: boolean;
  length: number;
}) {
  const counter =
    showCharCount && maxLength ? (
      <CharCount id={`${id}-count`} length={length} max={maxLength} />
    ) : null;
  if (!error && !helperText && !counter) return null;
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <HelperText id={`${id}-helper`}>{helperText}</HelperText>
        <FieldError id={`${id}-error`} message={error} />
      </div>
      {counter && <div className="shrink-0">{counter}</div>}
    </div>
  );
}

// ── Label ────────────────────────────────────────────────────────────────────

interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

export function Label({ children, required, className = '', ...props }: LabelProps) {
  return (
    <label className={`block text-sm font-medium text-brown-700 mb-1 ${className}`} {...props}>
      {children}
      {required && (
        <span className="text-error ml-0.5" aria-hidden="true">
          *
        </span>
      )}
    </label>
  );
}

// ── FieldError ───────────────────────────────────────────────────────────────

export function FieldError({ id, message }: { id?: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-xs text-error-dark flex items-center gap-1">
      {/* Error icon — purely decorative, aria-hidden so screen readers read the text only */}
      <svg
        aria-hidden="true"
        focusable="false"
        className="shrink-0 text-error"
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="currentColor"
      >
        <path d="M6 0a6 6 0 1 0 0 12A6 6 0 0 0 6 0Zm.75 8.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM6 3a.75.75 0 0 1 .75.75v2.5a.75.75 0 0 1-1.5 0v-2.5A.75.75 0 0 1 6 3Z" />
      </svg>
      {message}
    </p>
  );
}

// ── Input ────────────────────────────────────────────────────────────────────

/** Inline error indicator shown inside the input on the trailing edge */
function InputErrorIcon() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-error"
    >
      <svg width="16" height="16" viewBox="0 0 12 12" fill="currentColor">
        <path d="M6 0a6 6 0 1 0 0 12A6 6 0 0 0 6 0Zm.75 8.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM6 3a.75.75 0 0 1 .75.75v2.5a.75.75 0 0 1-1.5 0v-2.5A.75.75 0 0 1 6 3Z" />
      </svg>
    </span>
  );
}

/** Props shared by text-like fields for helper text, success state and char counts. */
interface FeedbackProps {
  /** Hint shown below the field describing format or constraints. */
  helperText?: React.ReactNode;
  /** Show a success border and check icon (e.g. after a valid blur). Ignored when `error` is set. */
  success?: boolean;
  /** Show a "length / maxLength" counter. Requires `maxLength`. */
  showCharCount?: boolean;
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement>, FeedbackProps {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    error,
    helperText,
    success,
    showCharCount,
    id: idProp,
    className = '',
    required,
    'aria-describedby': extraDescribedBy,
    ...props
  },
  ref
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const errorId = `${id}-error`;
  const showSuccess = !error && !!success;
  const hasCount = !!showCharCount && !!props.maxLength;
  const length = String(props.value ?? '').length;

  return (
    <div>
      {label && (
        <Label htmlFor={id} required={required}>
          {label}
        </Label>
      )}
      <div className="relative">
        <input
          ref={ref}
          id={id}
          aria-invalid={!!error}
          aria-describedby={describedBy(
            error && errorId,
            helperText ? `${id}-helper` : undefined,
            hasCount && `${id}-count`,
            extraDescribedBy
          )}
          required={required}
          className={`${inputBase} ${stateClass(error, showSuccess)} ${error || showSuccess ? 'pr-9' : ''} ${className}`}
          {...props}
        />
        {error && <InputErrorIcon />}
        {showSuccess && <InputSuccessIcon />}
      </div>
      <FieldFooter
        id={id}
        error={error}
        helperText={helperText}
        maxLength={props.maxLength}
        showCharCount={showCharCount}
        length={length}
      />
    </div>
  );
});

// ── Textarea ─────────────────────────────────────────────────────────────────

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement>, FeedbackProps {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    label,
    error,
    helperText,
    success,
    showCharCount,
    id: idProp,
    className = '',
    required,
    'aria-describedby': extraDescribedBy,
    ...props
  },
  ref
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const errorId = `${id}-error`;
  const showSuccess = !error && !!success;
  const hasCount = !!showCharCount && !!props.maxLength;
  const length = String(props.value ?? '').length;

  return (
    <div>
      {label && (
        <Label htmlFor={id} required={required}>
          {label}
        </Label>
      )}
      <div className="relative">
        <textarea
          ref={ref}
          id={id}
          aria-invalid={!!error}
          aria-describedby={describedBy(
            error && errorId,
            helperText ? `${id}-helper` : undefined,
            hasCount && `${id}-count`,
            extraDescribedBy
          )}
          required={required}
          className={`${inputBase} ${stateClass(error, showSuccess)} resize-y min-h-[6rem] ${error || showSuccess ? 'pr-9' : ''} ${className}`}
          {...props}
        />
        {showSuccess && <InputSuccessIcon className="top-3 right-3" />}
        {error && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-3 right-3 text-error"
          >
            <svg width="16" height="16" viewBox="0 0 12 12" fill="currentColor">
              <path d="M6 0a6 6 0 1 0 0 12A6 6 0 0 0 6 0Zm.75 8.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM6 3a.75.75 0 0 1 .75.75v2.5a.75.75 0 0 1-1.5 0v-2.5A.75.75 0 0 1 6 3Z" />
            </svg>
          </span>
        )}
      </div>
      <FieldFooter
        id={id}
        error={error}
        helperText={helperText}
        maxLength={props.maxLength}
        showCharCount={showCharCount}
        length={length}
      />
    </div>
  );
});

// ── Select ───────────────────────────────────────────────────────────────────

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  /** Hint shown below the select. */
  helperText?: React.ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    label,
    error,
    helperText,
    id: idProp,
    className = '',
    required,
    children,
    'aria-describedby': extraDescribedBy,
    ...props
  },
  ref
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const errorId = `${id}-error`;

  return (
    <div>
      {label && (
        <Label htmlFor={id} required={required}>
          {label}
        </Label>
      )}
      <div className="relative">
        <select
          ref={ref}
          id={id}
          aria-invalid={!!error}
          aria-describedby={describedBy(
            error && errorId,
            helperText ? `${id}-helper` : undefined,
            extraDescribedBy
          )}
          required={required}
          className={`${inputBase} ${error ? inputError : inputIdle} appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%235D3C15' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")] bg-no-repeat bg-[right_1rem_center] ${error ? 'pr-16' : 'pr-10'} ${className}`}
          {...props}
        >
          {children}
        </select>
        {error && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-8 flex items-center text-error"
          >
            <svg width="16" height="16" viewBox="0 0 12 12" fill="currentColor">
              <path d="M6 0a6 6 0 1 0 0 12A6 6 0 0 0 6 0Zm.75 8.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM6 3a.75.75 0 0 1 .75.75v2.5a.75.75 0 0 1-1.5 0v-2.5A.75.75 0 0 1 6 3Z" />
            </svg>
          </span>
        )}
      </div>
      <HelperText id={`${id}-helper`}>{helperText}</HelperText>
      <FieldError id={errorId} message={error} />
    </div>
  );
});

// ── Checkbox ─────────────────────────────────────────────────────────────────

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  error?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, error, id: idProp, className = '', ...props },
  ref
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const errorId = `${id}-error`;

  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          ref={ref}
          type="checkbox"
          id={id}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          className={`h-4 w-4 rounded border-brown-300 text-gold-600 accent-gold-600 focus:ring-2 focus:ring-gold/40 disabled:cursor-not-allowed ${error ? 'border-error' : ''} ${className}`}
          {...props}
        />
        <label htmlFor={id} className="text-sm text-brown-700 select-none">
          {label}
        </label>
      </div>
      <FieldError id={errorId} message={error} />
    </div>
  );
});

// ── Radio ────────────────────────────────────────────────────────────────────

export interface RadioOption {
  value: string;
  label: string;
}

export interface RadioGroupProps {
  name: string;
  label?: string;
  options: RadioOption[];
  value?: string;
  onChange?: (value: string) => void;
  error?: string;
  disabled?: boolean;
}

export function RadioGroup({
  name,
  label,
  options,
  value,
  onChange,
  error,
  disabled,
}: RadioGroupProps) {
  const groupId = useId();
  const errorId = `${groupId}-error`;

  return (
    <fieldset aria-describedby={error ? errorId : undefined}>
      {label && <legend className="text-sm font-medium text-brown-700 mb-2">{label}</legend>}
      <div className="space-y-2">
        {options.map((opt) => {
          const id = `${groupId}-${opt.value}`;
          return (
            <div key={opt.value} className="flex items-center gap-2">
              <input
                type="radio"
                id={id}
                name={name}
                value={opt.value}
                checked={value === opt.value}
                onChange={() => onChange?.(opt.value)}
                disabled={disabled}
                className={`h-4 w-4 border-brown-300 text-gold-600 accent-gold-600 focus:ring-2 focus:ring-gold/40 disabled:cursor-not-allowed ${error ? 'border-error' : ''}`}
              />
              <label htmlFor={id} className="text-sm text-brown-700 select-none">
                {opt.label}
              </label>
            </div>
          );
        })}
      </div>
      <FieldError id={errorId} message={error} />
    </fieldset>
  );
}
