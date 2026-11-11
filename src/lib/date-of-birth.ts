import { validateDateOfBirth } from "../../convex/age";

/** UI and HTTP validation share the backend calendar-day and leap-day policy. */
export function dateOfBirthError(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return "Enter your date of birth.";
  try {
    validateDateOfBirth(value);
    return undefined;
  } catch {
    return "Enter a valid date of birth. You must be between 18 and 99.";
  }
}

export const ageForDateOfBirth = validateDateOfBirth;

/** Omit unchanged DOB and a cleared legacy blank; never allow clearing a known DOB. */
export function changedDateOfBirth(value: string | undefined, originalValue: string | undefined): string | undefined {
  if ((value ?? "") === (originalValue ?? "")) return undefined;
  return value ?? "";
}
