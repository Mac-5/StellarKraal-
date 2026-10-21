'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import ConfirmDialog from '@/components/ConfirmDialog';
import Spinner from '@/components/Spinner';
import { submitVariants } from '@/lib/animations';
import { classifyApiError } from '@/lib/apiErrorToast';
import { throwIfNotOk } from '@/lib/api';
import { signTransaction } from '@/lib/freighterClient';
import { submitSignedXdr } from '@/lib/stellarUtils';
import { useToast } from '@/components/toast';
import {
  Button,
  ErrorSummary,
  FieldError,
  HelperText,
  Input,
  Select,
  toSummaryErrors,
} from '@/components/ui';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useTransactionStatus, type TransactionStatus } from '@/hooks/useTransactionStatus';

interface Props {
  walletAddress: string;
  onSuccess?: (collateralId: string) => void;
}

interface FormData {
  animalType: string;
  quantity: string;
  appraisedValue: string;
  image: File | null;
}

type FormErrors = Partial<Record<keyof FormData, string>>;
type Step = 1 | 2;

const ANIMAL_TYPES = ['cattle', 'goat', 'sheep'];
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const AUTO_SAVE_INTERVAL = 5000;
const STORAGE_KEY = 'stellarkraal_collateral_form';
const STEP_HEADING_ID = 'collateral-step-heading';
const STEP_LABELS = ['Basic Info', 'Valuation & Photo'] as const;
const INITIAL_FORM_DATA: FormData = {
  animalType: 'cattle',
  quantity: '',
  appraisedValue: '',
  image: null,
};
const FIELD_IDS: Record<keyof FormData, string> = {
  animalType: 'reg-animal-type',
  quantity: 'reg-quantity',
  appraisedValue: 'reg-appraised-value',
  image: 'reg-image',
};
const BASIC_FIELDS: Array<keyof FormData> = ['animalType', 'quantity'];
const VALUATION_FIELDS: Array<keyof FormData> = ['appraisedValue', 'image'];
const ALL_FIELDS: Array<keyof FormData> = [...BASIC_FIELDS, ...VALUATION_FIELDS];
const QUANTITY_MAX = 10_000;
const IMAGE_MAX_MB = 5;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export default function CollateralRegistrationForm({ walletAddress, onSuccess }: Props) {
  const reduced = useReducedMotion();
  const toast = useToast();
  const { isOnline } = useNetworkStatus();
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM_DATA);
  const [errors, setErrors] = useState<FormErrors>({});
  // Fields the user has left at least once. Errors first appear on blur; after
  // that they update live so the user sees the moment a value becomes valid.
  const [touched, setTouched] = useState<Partial<Record<keyof FormData, boolean>>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [submitCount, setSubmitCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showRestorePrompt, setShowRestorePrompt] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [, setSuccessId] = useState<string | null>(null);
  const [pendingHash, setPendingHash] = useState<string | null>(null);
  const [pendingError, setPendingError] = useState<string | null>(null);

  // Image upload and drag-and-drop state
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousStepRef = useRef(currentStep);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved);
      if (parsed.walletAddress === walletAddress && parsed.data) {
        setShowRestorePrompt(true);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [walletAddress]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!formData.quantity && !formData.appraisedValue) return;

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          walletAddress,
          step: currentStep,
          data: {
            animalType: formData.animalType,
            quantity: formData.quantity,
            appraisedValue: formData.appraisedValue,
          },
          timestamp: new Date().toISOString(),
        })
      );
      setLastSaved(new Date());
    }, AUTO_SAVE_INTERVAL);

    return () => clearInterval(interval);
  }, [currentStep, formData, walletAddress]);

  useEffect(() => {
    if (previousStepRef.current !== currentStep) {
      stepHeadingRef.current?.focus();
    }
    previousStepRef.current = currentStep;
  }, [currentStep]);

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  const restoreSavedData = () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved);
      const data = parsed.data ?? {};
      setFormData({
        animalType: ANIMAL_TYPES.includes(data.animalType)
          ? data.animalType
          : INITIAL_FORM_DATA.animalType,
        quantity: typeof data.quantity === 'string' ? data.quantity : '',
        appraisedValue: typeof data.appraisedValue === 'string' ? data.appraisedValue : '',
        image: null,
      });
      setCurrentStep(parsed.step === 2 ? 2 : 1);
      setShowRestorePrompt(false);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const dismissRestore = () => {
    setShowRestorePrompt(false);
    localStorage.removeItem(STORAGE_KEY);
  };

  const validateField = useCallback(
    (name: keyof FormData, value: string | File | null): string | undefined => {
      if (name === 'animalType') {
        return !value || !ANIMAL_TYPES.includes(String(value))
          ? 'Animal type is required'
          : undefined;
      }

      if (name === 'quantity') {
        if (!value) return 'Enter how many animals you are registering.';
        const quantity = Number(value);
        if (!Number.isInteger(quantity)) return 'Enter a whole number of animals (no decimals).';
        if (quantity < 1 || quantity > QUANTITY_MAX)
          return `Enter a count between 1 and ${QUANTITY_MAX.toLocaleString('en-US')}.`;
        return undefined;
      }

      if (name === 'appraisedValue') {
        if (!value) return 'Enter the appraised value in stroops.';
        const appraisedValue = Number(value);
        if (!Number.isInteger(appraisedValue))
          return 'Enter a whole number of stroops (1 XLM = 10,000,000 stroops).';
        if (appraisedValue <= 0) return 'Enter an appraised value greater than 0 stroops.';
        return undefined;
      }

      if (!value || !(value instanceof File)) return 'Add a photo of the animals to continue.';

      if (!IMAGE_TYPES.includes(value.type)) {
        return 'Choose a JPEG, PNG, WebP, or GIF image.';
      }
      if (value.size > IMAGE_MAX_MB * 1024 * 1024)
        return `Choose an image smaller than ${IMAGE_MAX_MB} MB (this one is ${(value.size / (1024 * 1024)).toFixed(1)} MB).`;

      return undefined;
    },
    []
  );

  const handleChange = (name: keyof FormData, value: string | File | null) => {
    setFormData((previous) => ({ ...previous, [name]: value }));
    // Picking a file or an option is a complete action, so validate right away.
    // Typed fields wait for the first blur before showing errors.
    const immediate = name === 'image' || name === 'animalType';
    if (immediate) setTouched((previous) => ({ ...previous, [name]: true }));
    if (immediate || touched[name] || errors[name]) {
      setErrors((previous) => ({ ...previous, [name]: validateField(name, value) }));
    }
  };

  const handleBlur = (name: keyof FormData) => {
    setTouched((previous) => ({ ...previous, [name]: true }));
    setErrors((previous) => ({
      ...previous,
      [name]: validateField(name, formData[name]),
    }));
  };

  /** True once a blurred field holds a valid value — drives the success indicator. */
  const isValid = (name: keyof FormData) => !!touched[name] && !errors[name];

  const processFile = (file: File | null) => {
    handleChange('image', file);

    if (!file || validateField('image', file)) {
      setImagePreview(null);
      return;
    }

    setImagePreview(URL.createObjectURL(file));
  };

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0] ?? null;
    processFile(file);
  };

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.contains(event.relatedTarget as Node)) return;
    setIsDragging(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    if (loading) return;

    const file = event.dataTransfer.files?.[0] ?? null;
    if (file) {
      processFile(file);
    }
  };

  const handleDropZoneKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      imageInputRef.current?.click();
    }
  };

  const removePhoto = () => {
    if (imageInputRef.current) imageInputRef.current.value = '';
    handleChange('image', null);
    setImagePreview(null);
    setFileInputKey((key) => key + 1);
  };

  const validateFields = (fields: Array<keyof FormData>) => {
    const fieldErrors: FormErrors = {};
    fields.forEach((field) => {
      const error = validateField(field, formData[field]);
      if (error) fieldErrors[field] = error;
    });

    setErrors((previous) => {
      const nextErrors = { ...previous };
      fields.forEach((field) => {
        const error = fieldErrors[field];
        if (error) nextErrors[field] = error;
        else delete nextErrors[field];
      });
      return nextErrors;
    });

    return Object.keys(fieldErrors).length === 0;
  };

  const stepFields = currentStep === 1 ? BASIC_FIELDS : ALL_FIELDS;
  const visibleErrors = Object.fromEntries(stepFields.map((field) => [field, errors[field]]));

  const moveBack = () => {
    setSubmitAttempted(false);
    setCurrentStep(1);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitAttempted(true);
    setSubmitCount((c) => c + 1);

    if (currentStep === 1) {
      if (validateFields(BASIC_FIELDS)) setCurrentStep(2);
      return;
    }

    if (validateFields(ALL_FIELDS)) setShowConfirm(true);
  };

  const registerCollateral = async () => {
    setLoading(true);
    setPendingError(null);
    try {
      const response = await fetch(`${API}/api/v1/collateral/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: walletAddress,
          animal_type: formData.animalType,
          count: parseInt(formData.quantity, 10),
          appraised_value: parseInt(formData.appraisedValue, 10),
        }),
      });
      await throwIfNotOk(response);
      const { xdr } = await response.json();
      const { signedTxXdr } = await signTransaction(xdr, {
        network: process.env.NEXT_PUBLIC_NETWORK || 'TESTNET',
      });
      const hash = await submitSignedXdr(signedTxXdr);
      setPendingHash(hash);
      localStorage.removeItem(STORAGE_KEY);
      setLastSaved(null);
      setErrors({});
      setTouched({});
      setSubmitAttempted(false);
    } catch (e) {
      const { variant, message } = classifyApiError(e);
      toast[variant](message);
      setStatus(`error:${message}`);
    } finally {
      setLoading(false);
    }
  };

  function handleTxTerminal(status: TransactionStatus, errorCode?: string) {
    if (status === 'confirmed' && pendingHash) {
      setSuccessId(pendingHash);
      onSuccess?.(pendingHash);
    } else if (status === 'failed') {
      const message = errorCode ? `Transaction failed: ${errorCode}` : 'Transaction failed';
      setPendingError(message);
      toast.error(message);
    }
    setPendingHash(null);
  }

  useTransactionStatus(pendingHash, {
    interval: 3000,
    onTerminal: handleTxTerminal,
  });

  const isError = status?.startsWith('error:');

  return (
    <div className="space-y-4 rounded-2xl bg-white p-6 text-brown-700 shadow dark:bg-brown-900 dark:text-cream-50">
      {showRestorePrompt && (
        <div className="rounded-xl border border-gold-300 bg-gold-100 p-4 dark:border-gold-700 dark:bg-gold-950">
          <p className="mb-3 text-sm text-brown-700 dark:text-cream-100">
            You have unsaved progress. Would you like to restore it?
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={restoreSavedData}>
              Restore
            </Button>
            <Button size="sm" variant="ghost" onClick={dismissRestore}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-xl font-semibold text-brown-700 dark:text-cream-50">
          Register Livestock Collateral
        </h2>
        <p className="mt-1 text-sm text-brown-600 dark:text-brown-200">
          Complete both steps to register your collateral.
        </p>
      </div>

      <nav aria-label="Collateral registration progress">
        <ol className="grid grid-cols-2 gap-3" aria-label="Registration steps">
          {STEP_LABELS.map((label, index) => {
            const step = (index + 1) as Step;
            const isCurrent = currentStep === step;
            const isComplete = currentStep > step;

            return (
              <li
                key={label}
                aria-current={isCurrent ? 'step' : undefined}
                className="flex min-w-0 items-center gap-2"
              >
                <span
                  aria-hidden="true"
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold focus:outline-none ${
                    isComplete
                      ? 'bg-success text-white'
                      : isCurrent
                        ? 'border-2 border-brown-600 bg-brown-600 text-white dark:border-gold-500 dark:bg-gold-500 dark:text-brown-900'
                        : 'border-2 border-brown-300 bg-white text-brown-500 dark:border-brown-600 dark:bg-brown-900 dark:text-brown-300'
                  }`}
                >
                  {isComplete ? '✓' : step}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="block text-xs text-brown-600 dark:text-brown-300">
                    {isComplete ? 'Completed' : isCurrent ? 'Current step' : 'Not started'}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      </nav>

      <form
        data-onboarding-target="collateral"
        onSubmit={handleSubmit}
        className="space-y-4"
        noValidate
      >
        <h3
          id={STEP_HEADING_ID}
          ref={stepHeadingRef}
          tabIndex={-1}
          className="text-lg font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
        >
          {currentStep === 1 ? 'Basic Info' : 'Valuation & Photo'}
        </h3>

        <ErrorSummary
          errors={submitAttempted ? toSummaryErrors(visibleErrors, FIELD_IDS) : []}
          submitCount={submitCount}
        />

        {currentStep === 1 ? (
          <section aria-labelledby={STEP_HEADING_ID} className="space-y-4">
            <Select
              id={FIELD_IDS.animalType}
              label="Animal Type"
              required
              value={formData.animalType}
              onChange={(event) => handleChange('animalType', event.target.value)}
              onBlur={() => handleBlur('animalType')}
              error={errors.animalType}
              helperText="The type of livestock you are pledging as collateral."
              disabled={loading}
            >
              {ANIMAL_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </option>
              ))}
            </Select>

            <Input
              id={FIELD_IDS.quantity}
              label="Count"
              required
              type="number"
              min="1"
              step="1"
              placeholder="Number of animals"
              value={formData.quantity}
              onChange={(event) => handleChange('quantity', event.target.value)}
              max={QUANTITY_MAX}
              inputMode="numeric"
              onBlur={() => handleBlur('quantity')}
              error={errors.quantity}
              success={isValid('quantity')}
              helperText={`Whole number between 1 and ${QUANTITY_MAX.toLocaleString('en-US')}.`}
              disabled={loading}
            />
          </section>
        ) : (
          <section aria-labelledby={STEP_HEADING_ID} className="space-y-4">
            <Input
              id={FIELD_IDS.appraisedValue}
              label="Appraised Value (stroops)"
              required
              type="number"
              min="1"
              step="1"
              placeholder="Total value in stroops"
              value={formData.appraisedValue}
              onChange={(event) => handleChange('appraisedValue', event.target.value)}
              inputMode="numeric"
              onBlur={() => handleBlur('appraisedValue')}
              error={errors.appraisedValue}
              success={isValid('appraisedValue')}
              helperText="Whole number of stroops (1 XLM = 10,000,000 stroops). You can borrow up to 70% of this."
              disabled={loading}
            />

            <div className="space-y-2">
              <label
                htmlFor={FIELD_IDS.image}
                className="block text-sm font-medium text-brown-700 dark:text-cream-50"
              >
                Animal Photo <span className="text-error">*</span>
              </label>

              {!imagePreview ? (
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Upload animal photo drop zone. Drag and drop file here or press Enter to choose file"
                  onDragEnter={handleDragEnter}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => imageInputRef.current?.click()}
                  onKeyDown={handleDropZoneKeyDown}
                  className={`relative flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-xl cursor-pointer transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2 ${
                    isDragging
                      ? 'border-gold-500 bg-gold-50/70 dark:bg-gold-950/40 ring-2 ring-gold-500/50'
                      : errors.image
                        ? 'border-error bg-error/5 dark:border-error dark:bg-error/10'
                        : 'border-brown-300 dark:border-brown-600 bg-brown-50/30 dark:bg-brown-900/30 hover:border-gold-500 dark:hover:border-gold-500'
                  }`}
                >
                  <input
                    key={fileInputKey}
                    ref={imageInputRef}
                    id={FIELD_IDS.image}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    required
                    onChange={handleImageChange}
                    onBlur={() => handleBlur('image')}
                    disabled={loading}
                    className="sr-only"
                    aria-invalid={!!errors.image}
                    aria-describedby={
                      errors.image ? `${FIELD_IDS.image}-error` : `${FIELD_IDS.image}-helper`
                    }
                  />
                  <div className="flex flex-col items-center text-center pointer-events-none">
                    <svg
                      className={`w-10 h-10 mb-3 transition-colors ${
                        isDragging
                          ? 'text-gold-600 dark:text-gold-400'
                          : 'text-brown-400 dark:text-brown-300'
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.75"
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                      />
                    </svg>
                    <p className="text-sm font-medium text-brown-700 dark:text-cream-100">
                      <span className="text-gold-600 dark:text-gold-400 font-semibold underline">
                        Click to upload
                      </span>{' '}
                      or drag and drop
                    </p>
                    <p className="mt-1 text-xs text-brown-500 dark:text-brown-300">
                      JPEG, PNG, WebP or GIF (max 5MB)
                    </p>
                  </div>
                </div>
              ) : (
                <div className="relative mt-3 rounded-xl border border-brown-200 dark:border-brown-700 p-3 bg-brown-50/20 dark:bg-brown-900/20 w-full sm:w-fit">
                  <input
                    key={fileInputKey}
                    ref={imageInputRef}
                    id={FIELD_IDS.image}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={handleImageChange}
                    onBlur={() => handleBlur('image')}
                    disabled={loading}
                    className="sr-only"
                    aria-invalid={!!errors.image}
                    aria-describedby={errors.image ? `${FIELD_IDS.image}-error` : undefined}
                  />
                  <div className="flex flex-col items-start gap-4 sm:flex-row">
                    <img
                      src={imagePreview}
                      alt={`${formData.animalType} animal photo preview`}
                      className="max-h-48 rounded-lg border border-brown-200 dark:border-brown-600 object-cover shadow-sm"
                    />
                    <div className="flex min-w-0 flex-col justify-between self-stretch pr-8">
                      <div>
                        <p className="text-sm font-semibold text-brown-800 dark:text-cream-100 break-all">
                          {formData.image?.name || 'Selected photo'}
                        </p>
                        {formData.image?.size ? (
                          <p className="text-xs text-brown-500 dark:text-brown-300 mt-0.5">
                            {(formData.image.size / (1024 * 1024)).toFixed(2)} MB
                          </p>
                        ) : null}
                        <span className="inline-block mt-2 px-2 py-0.5 text-[11px] font-medium rounded-full bg-success-light text-success-dark dark:bg-green-950 dark:text-green-300">
                          Ready for submission
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={removePhoto}
                        className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-error hover:text-error-dark focus:outline-none focus-visible:underline"
                        aria-label="Remove animal photo"
                      >
                        <span aria-hidden="true">✕</span> Remove photo
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={removePhoto}
                    className="absolute right-2 top-2 rounded-full bg-error p-1.5 text-white hover:bg-error/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-error focus-visible:ring-offset-2"
                    aria-label="Remove animal photo"
                  >
                    <span aria-hidden="true" className="text-xs leading-none">
                      ✕
                    </span>
                  </button>
                </div>
              )}

              <HelperText id={`${FIELD_IDS.image}-helper`}>
                A clear photo of the animals helps the appraiser verify your collateral.
              </HelperText>
              <FieldError id={`${FIELD_IDS.image}-error`} message={errors.image} />
            </div>
          </section>
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          {currentStep === 2 && (
            <button
              type="button"
              onClick={moveBack}
              disabled={loading}
              className="min-h-11 rounded-xl border-2 border-brown-300 px-5 py-2.5 font-semibold text-brown-700 transition hover:border-brown-500 hover:bg-brown-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-brown-600 dark:text-cream-50 dark:hover:bg-brown-800"
            >
              Back
            </button>
          )}

          {currentStep === 1 ? (
            <motion.button
              type="submit"
              variants={reduced ? undefined : submitVariants}
              animate="idle"
              className="min-h-11 rounded-xl bg-brown-600 px-5 py-2.5 font-semibold text-cream-50 transition hover:bg-brown-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2 sm:ml-auto"
            >
              Continue
            </motion.button>
          ) : (
            <motion.button
              type="submit"
              variants={reduced ? undefined : submitVariants}
              animate={loading ? 'loading' : 'idle'}
              className="min-h-11 rounded-xl bg-brown-600 px-5 py-2.5 font-semibold text-cream-50 transition hover:bg-brown-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:ml-auto"
              disabled={loading || !isOnline}
              aria-disabled={loading || !isOnline}
              title={!isOnline ? "You're offline" : undefined}
            >
              {loading ? (
                <>
                  <Spinner />
                  Processing…
                </>
              ) : !isOnline ? (
                "You're offline"
              ) : (
                'Register Collateral'
              )}
            </motion.button>
          )}
        </div>
      </form>

      {lastSaved && !loading && (
        <p className="text-center text-xs text-brown-500 dark:text-brown-300">
          Auto-saved at {lastSaved.toLocaleTimeString()}
        </p>
      )}

      {status && (
        <div
          role="status"
          className={`rounded-xl p-3 text-sm ${
            isError
              ? 'bg-error-light text-error-dark dark:bg-red-950 dark:text-red-200'
              : 'bg-success-light text-success-dark dark:bg-green-950 dark:text-green-200'
          }`}
        >
          {isError ? status.replace('error:', '') : status}
        </div>
      )}

      {pendingHash && (
        <div
          className="p-3 rounded-xl text-sm bg-amber-50 border border-amber-200 text-amber-800"
          role="status"
          aria-live="polite"
        >
          <p className="font-medium">Transaction pending confirmation...</p>
          <p className="font-mono text-xs mt-1 break-all">{pendingHash}</p>
          {pendingError && <p className="text-red-600 mt-1">{pendingError}</p>}
        </div>
      )}

      <ConfirmDialog
        open={showConfirm}
        title="Register Collateral"
        message={`Register ${formData.quantity} ${formData.animalType}(s) with an appraised value of ${formData.appraisedValue} stroops as on-chain collateral? This action cannot be undone.`}
        confirmLabel="Register"
        onConfirm={() => {
          setShowConfirm(false);
          void registerCollateral();
        }}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
}
