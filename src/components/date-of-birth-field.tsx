"use client";

import { dateOfBirthError, changedDateOfBirth } from "@/lib/date-of-birth";

/** Owner-only editor; undefined preserves legacy records without inventing a birthday. */
export function DateOfBirthField({ value, originalValue, onChange }: { value?: string; originalValue?: string; onChange: (value: string) => void }) {
  const change = changedDateOfBirth(value, originalValue);
  const error = change === undefined ? undefined : dateOfBirthError(change);
  return (
    <div className="field">
      <label htmlFor="dateOfBirth">Date of birth</label>
      <input id="dateOfBirth" name="dateOfBirth" type="date" autoComplete="bday"
        value={value ?? ""} onChange={(event) => onChange(event.target.value)}
        aria-invalid={!!error} aria-describedby="birthday-help birthday-error" />
      <p id="birthday-help" className="muted">Your age is shared with matches, not your date of birth. New or changed birthdays must be for ages 18–99. If your birthday is not on file, you can leave it blank.</p>
      <p id="birthday-error" className="field-error" aria-live="polite">{error}</p>
    </div>
  );
}
