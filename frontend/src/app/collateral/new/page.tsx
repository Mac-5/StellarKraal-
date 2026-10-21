'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';

const collateralSchema = z.object({
  animalType: z.enum(['cattle', 'goat', 'sheep', 'pig', 'poultry'], {
    errorMap: () => ({ message: 'Please select an animal type' }),
  }),
  breed: z
    .string()
    .trim()
    .min(2, 'Breed must be at least 2 characters')
    .max(100, 'Breed must be at most 100 characters'),
  weightKg: z.coerce
    .number({ invalid_type_error: 'Weight must be a number' })
    .positive('Weight must be greater than 0')
    .max(2000, 'Weight must be at most 2000 kg'),
  ageMonths: z.coerce
    .number({ invalid_type_error: 'Age must be a number' })
    .int('Age must be a whole number of months')
    .min(1, 'Age must be at least 1 month')
    .max(240, 'Age must be at most 240 months'),
  estimatedValue: z.coerce
    .number({ invalid_type_error: 'Estimated value must be a number' })
    .positive('Estimated value must be greater than 0'),
});

type CollateralFormValues = z.infer<typeof collateralSchema>;

export default function NewCollateralPage() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CollateralFormValues>({
    resolver: zodResolver(collateralSchema),
    defaultValues: {
      breed: '',
    },
  });

  const onSubmit = async (values: CollateralFormValues) => {
    try {
      const response = await fetch('/api/collateral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        throw new Error('Failed to register collateral');
      }

      toast.success('Collateral registered successfully');
      router.push('/collateral');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to register collateral'
      );
    }
  };

  return (
    <div className="mx-auto max-w-xl p-6">
      <h1 className="mb-6 text-2xl font-semibold">Register Collateral</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div>
          <label htmlFor="animalType" className="mb-1 block text-sm font-medium">
            Animal Type
          </label>
          <select
            id="animalType"
            className="w-full rounded border px-3 py-2"
            defaultValue=""
            {...register('animalType')}
          >
            <option value="" disabled>
              Select animal type
            </option>
            <option value="cattle">Cattle</option>
            <option value="goat">Goat</option>
            <option value="sheep">Sheep</option>
            <option value="pig">Pig</option>
            <option value="poultry">Poultry</option>
          </select>
          {errors.animalType && (
            <p className="mt-1 text-sm text-red-600">{errors.animalType.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="breed" className="mb-1 block text-sm font-medium">
            Breed
          </label>
          <input
            id="breed"
            type="text"
            className="w-full rounded border px-3 py-2"
            {...register('breed')}
          />
          {errors.breed && (
            <p className="mt-1 text-sm text-red-600">{errors.breed.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="weightKg" className="mb-1 block text-sm font-medium">
            Weight (kg)
          </label>
          <input
            id="weightKg"
            type="number"
            step="0.1"
            className="w-full rounded border px-3 py-2"
            {...register('weightKg')}
          />
          {errors.weightKg && (
            <p className="mt-1 text-sm text-red-600">{errors.weightKg.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="ageMonths" className="mb-1 block text-sm font-medium">
            Age (months)
          </label>
          <input
            id="ageMonths"
            type="number"
            step="1"
            className="w-full rounded border px-3 py-2"
            {...register('ageMonths')}
          />
          {errors.ageMonths && (
            <p className="mt-1 text-sm text-red-600">{errors.ageMonths.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="estimatedValue" className="mb-1 block text-sm font-medium">
            Estimated Value
          </label>
          <input
            id="estimatedValue"
            type="number"
            step="0.01"
            className="w-full rounded border px-3 py-2"
            {...register('estimatedValue')}
          />
          {errors.estimatedValue && (
            <p className="mt-1 text-sm text-red-600">
              {errors.estimatedValue.message}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {isSubmitting ? 'Submitting...' : 'Register Collateral'}
        </button>
      </form>
    </div>
  );
}
