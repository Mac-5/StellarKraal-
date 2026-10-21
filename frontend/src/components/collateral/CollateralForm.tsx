import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useRegisterCollateralMutation } from '../../api/collateralApi';

const collateralSchema = z.object({
  animalType: z.enum(['cattle', 'goat', 'sheep', 'pig', 'poultry'], {
    errorMap: () => ({ message: 'Please select an animal type' }),
  }),
  breed: z
    .string()
    .trim()
    .min(2, 'Breed must be at least 2 characters')
    .max(100, 'Breed must be at most 100 characters'),
  weight: z
    .coerce
    .number({ invalid_type_error: 'Weight is required' })
    .positive('Weight must be greater than 0')
    .max(2000, 'Weight must be at most 2000 kg'),
  age: z
    .coerce
    .number({ invalid_type_error: 'Age is required' })
    .int('Age must be a whole number of months')
    .min(1, 'Age must be at least 1 month')
    .max(360, 'Age must be at most 360 months'),
  estimatedValue: z
    .coerce
    .number({ invalid_type_error: 'Estimated value is required' })
    .positive('Estimated value must be greater than 0'),
});

type CollateralFormValues = z.infer<typeof collateralSchema>;

const ANIMAL_TYPES = [
  { value: 'cattle', label: 'Cattle' },
  { value: 'goat', label: 'Goat' },
  { value: 'sheep', label: 'Sheep' },
  { value: 'pig', label: 'Pig' },
  { value: 'poultry', label: 'Poultry' },
];

export default function CollateralForm() {
  const navigate = useNavigate();
  const [registerCollateral, { isLoading }] = useRegisterCollateralMutation();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CollateralFormValues>({
    resolver: zodResolver(collateralSchema),
    defaultValues: {
      animalType: undefined,
      breed: '',
      weight: undefined,
      age: undefined,
      estimatedValue: undefined,
    },
  });

  const onSubmit = async (values: CollateralFormValues) => {
    try {
      await registerCollateral(values).unwrap();
      toast.success('Collateral registered successfully');
      navigate('/collateral');
    } catch (err) {
      const message =
        (err as { data?: { message?: string } })?.data?.message ??
        'Failed to register collateral. Please try again.';
      toast.error(message);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="collateral-form" noValidate>
      <div className="form-field">
        <label htmlFor="animalType">Animal Type</label>
        <select id="animalType" {...register('animalType')} aria-invalid={!!errors.animalType}>
          <option value="">Select animal type</option>
          {ANIMAL_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
        {errors.animalType && <span className="field-error">{errors.animalType.message}</span>}
      </div>

      <div className="form-field">
        <label htmlFor="breed">Breed</label>
        <input id="breed" type="text" {...register('breed')} aria-invalid={!!errors.breed} />
        {errors.breed && <span className="field-error">{errors.breed.message}</span>}
      </div>

      <div className="form-field">
        <label htmlFor="weight">Weight (kg)</label>
        <input
          id="weight"
          type="number"
          step="0.1"
          {...register('weight')}
          aria-invalid={!!errors.weight}
        />
        {errors.weight && <span className="field-error">{errors.weight.message}</span>}
      </div>

      <div className="form-field">
        <label htmlFor="age">Age (months)</label>
        <input id="age" type="number" {...register('age')} aria-invalid={!!errors.age} />
        {errors.age && <span className="field-error">{errors.age.message}</span>}
      </div>

      <div className="form-field">
        <label htmlFor="estimatedValue">Estimated Value</label>
        <input
          id="estimatedValue"
          type="number"
          step="0.01"
          {...register('estimatedValue')}
          aria-invalid={!!errors.estimatedValue}
        />
        {errors.estimatedValue && (
          <span className="field-error">{errors.estimatedValue.message}</span>
        )}
      </div>

      <button type="submit" disabled={isLoading}>
        {isLoading ? 'Submitting...' : 'Register Collateral'}
      </button>
    </form>
  );
}
