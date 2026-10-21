import { useMemo, useState } from 'react';

type AnimalType = 'cattle' | 'goat' | 'sheep' | 'pig';

interface FormState {
  animalType: AnimalType | '';
  breed: string;
  ageMonths: string;
  weightKg: string;
  healthScore: string;
}

interface FieldErrors {
  [key: string]: string | undefined;
}

const ANIMAL_TYPES: { value: AnimalType; label: string; icon: string }[] = [
  { value: 'cattle', label: 'Cattle', icon: '\u{1F404}' },
  { value: 'goat', label: 'Goat', icon: '\u{1F410}' },
  { value: 'sheep', label: 'Sheep', icon: '\u{1F411}' },
  { value: 'pig', label: 'Pig', icon: '\u{1F416}' },
];

const BASE_VALUE: Record<AnimalType, number> = {
  cattle: 800,
  goat: 150,
  sheep: 200,
  pig: 250,
};

const INITIAL_FORM: FormState = {
  animalType: '',
  breed: '',
  ageMonths: '',
  weightKg: '',
  healthScore: '',
};

function validateField(name: keyof FormState, value: string): string | undefined {
  switch (name) {
    case 'animalType':
      return value ? undefined : 'Please select an animal type';
    case 'breed':
      return value.trim() ? undefined : 'Breed is required';
    case 'ageMonths': {
      if (!value.trim()) return 'Age is required';
      const age = Number(value);
      if (Number.isNaN(age) || age <= 0) return 'Age must be a positive number';
      if (age > 240) return 'Age must be 240 months or less';
      return undefined;
    }
    case 'weightKg': {
      if (!value.trim()) return 'Weight is required';
      const weight = Number(value);
      if (Number.isNaN(weight) || weight <= 0) return 'Weight must be a positive number';
      if (weight > 2000) return 'Weight must be 2000 kg or less';
      return undefined;
    }
    case 'healthScore': {
      if (!value.trim()) return 'Health score is required';
      const score = Number(value);
      if (Number.isNaN(score) || score < 0 || score > 100) return 'Health score must be between 0 and 100';
      return undefined;
    }
    default:
      return undefined;
  }
}

function estimateValue(form: FormState): number {
  if (!form.animalType) return 0;
  const base = BASE_VALUE[form.animalType];
  const weight = Number(form.weightKg) || 0;
  const health = Number(form.healthScore) || 0;
  const age = Number(form.ageMonths) || 0;

  const weightFactor = weight > 0 ? Math.min(weight / 400, 2) : 0;
  const healthFactor = health > 0 ? health / 100 : 0;
  const ageFactor = age > 0 ? Math.max(0.4, 1 - age / 300) : 0;

  return Math.round(base * (0.5 + weightFactor) * (0.5 + healthFactor) * ageFactor);
}

export default function CollateralRegistration() {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);

  const estimatedValue = useMemo(() => estimateValue(form), [form]);

  const handleChange = (name: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [name]: value }));
    if (touched[name]) {
      setErrors((prev) => ({ ...prev, [name]: validateField(name, value) }));
    }
  };

  const handleBlur = (name: keyof FormState) => {
    setTouched((prev) => ({ ...prev, [name]: true }));
    setErrors((prev) => ({ ...prev, [name]: validateField(name, form[name]) }));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: FieldErrors = {};
    (Object.keys(form) as (keyof FormState)[]).forEach((key) => {
      const error = validateField(key, form[key]);
      if (error) nextErrors[key] = error;
    });
    setErrors(nextErrors);
    setTouched(
      (Object.keys(form) as (keyof FormState)[]).reduce<Record<string, boolean>>((acc, key) => {
        acc[key] = true;
        return acc;
      }, {}),
    );
    setSubmitted(Object.keys(nextErrors).length === 0);
  };

  const renderStatus = (name: keyof FormState) => {
    if (!touched[name]) return null;
    if (errors[name]) {
      return (
        <span className="field-status field-status--error" role="alert">
          \u2716 {errors[name]}
        </span>
      );
    }
    return (
      <span className="field-status field-status--success">
        \u2714 Looks good
      </span>
    );
  };

  return (
    <div className="collateral-registration">
      <h1>Register Collateral</h1>
      <p className="required-legend">
        <span className="required-mark">*</span> Required field
      </p>

      <form onSubmit={handleSubmit} noValidate>
        <fieldset className="animal-type-fieldset">
          <legend>
            Animal Type <span className="required-mark">*</span>
          </legend>
          <div className="animal-type-cards">
            {ANIMAL_TYPES.map((type) => (
              <button
                type="button"
                key={type.value}
                className={`animal-type-card${form.animalType === type.value ? ' animal-type-card--selected' : ''}`}
                aria-pressed={form.animalType === type.value}
                onClick={() => {
                  handleChange('animalType', type.value);
                  setTouched((prev) => ({ ...prev, animalType: true }));
                  setErrors((prev) => ({ ...prev, animalType: undefined }));
                }}
              >
                <span className="animal-type-card__icon" aria-hidden="true">
                  {type.icon}
                </span>
                <span className="animal-type-card__label">{type.label}</span>
              </button>
            ))}
          </div>
          {renderStatus('animalType')}
        </fieldset>

        <div className="form-field">
          <label htmlFor="breed">
            Breed <span className="required-mark">*</span>
          </label>
          <input
            id="breed"
            type="text"
            value={form.breed}
            onChange={(e) => handleChange('breed', e.target.value)}
            onBlur={() => handleBlur('breed')}
            aria-invalid={Boolean(errors.breed)}
          />
          {renderStatus('breed')}
        </div>

        <div className="form-field">
          <label htmlFor="ageMonths">
            Age (months) <span className="required-mark">*</span>
          </label>
          <input
            id="ageMonths"
            type="number"
            min="1"
            value={form.ageMonths}
            onChange={(e) => handleChange('ageMonths', e.target.value)}
            onBlur={() => handleBlur('ageMonths')}
            aria-invalid={Boolean(errors.ageMonths)}
          />
          {renderStatus('ageMonths')}
        </div>

        <div className="form-field">
          <label htmlFor="weightKg">
            Weight (kg) <span className="required-mark">*</span>
          </label>
          <input
            id="weightKg"
            type="number"
            min="1"
            value={form.weightKg}
            onChange={(e) => handleChange('weightKg', e.target.value)}
            onBlur={() => handleBlur('weightKg')}
            aria-invalid={Boolean(errors.weightKg)}
          />
          {renderStatus('weightKg')}
        </div>

        <div className="form-field">
          <label htmlFor="healthScore">
            Health Score (0-100) <span className="required-mark">*</span>
          </label>
          <input
            id="healthScore"
            type="number"
            min="0"
            max="100"
            value={form.healthScore}
            onChange={(e) => handleChange('healthScore', e.target.value)}
            onBlur={() => handleBlur('healthScore')}
            aria-invalid={Boolean(errors.healthScore)}
          />
          {renderStatus('healthScore')}
        </div>

        <div className="appraisal-estimate" aria-live="polite">
          <span className="appraisal-estimate__label">Estimated Appraisal Value</span>
          <span className="appraisal-estimate__value">
            {estimatedValue > 0 ? `$${estimatedValue.toLocaleString()}` : '\u2014'}
          </span>
        </div>

        <button type="submit" className="submit-button">
          Register Collateral
        </button>

        {submitted && (
          <p className="submit-success" role="status">
            Collateral details validated successfully.
          </p>
        )}
      </form>
    </div>
  );
}
