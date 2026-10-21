import { z } from "zod";

/**
 * Validation schema for livestock collateral registration.
 * Mirrors the backend rules for animal type, breed, weight, age and value.
 */
export const collateralSchema = z.object({
  animalType: z.enum(["cattle", "goat", "sheep", "pig", "poultry", "other"], {
    errorMap: () => ({ message: "Please select an animal type" }),
  }),
  breed: z
    .string()
    .trim()
    .min(2, "Breed must be at least 2 characters")
    .max(100, "Breed must be at most 100 characters"),
  weightKg: z
    .number({ invalid_type_error: "Weight is required" })
    .positive("Weight must be greater than 0")
    .max(5000, "Weight must be at most 5000 kg"),
  ageMonths: z
    .number({ invalid_type_error: "Age is required" })
    .int("Age must be a whole number of months")
    .min(1, "Age must be at least 1 month")
    .max(360, "Age must be at most 360 months"),
  estimatedValue: z
    .number({ invalid_type_error: "Estimated value is required" })
    .positive("Estimated value must be greater than 0")
    .max(100000000, "Estimated value is too large"),
});

export type CollateralFormValues = z.infer<typeof collateralSchema>;

export const collateralDefaultValues: CollateralFormValues = {
  animalType: "cattle",
  breed: "",
  weightKg: 0,
  ageMonths: 0,
  estimatedValue: 0,
};
