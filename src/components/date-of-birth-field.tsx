"use client";

import { dateOfBirthError, changedDateOfBirth } from "@/lib/date-of-birth";

/** Owner-only editor; undefined preserves legacy records without inventing a birthday. */
export function DateOfBirthField({ value, originalValue, onChange, externalHelp = false, hideHelp = false }: { externalHelp?: boolean; hideHelp?: boolean; value?: string; originalValue?: string; onChange: (value: string) => void }) {
  const change = changedDateOfBirth(value, originalValue);
  const error = change === undefined ? undefined : dateOfBirthError(change);
  return (
    <div className="field">
      <label htmlFor="dateOfBirth">Date of birth</label>
      <input id="dateOfBirth" name="dateOfBirth" type="date" autoComplete="bday"
        value={value ?? ""} onChange={(event) => onChange(event.target.value)}
        aria-invalid={!!error} aria-describedby={hideHelp ? "birthday-error" : "birthday-help birthday-error"} />
      {!hideHelp && !externalHelp && <p id="birthday-help" className="muted">Please add your date of birth for our records and background checks. Only your age is shared with matches.</p>}
      <p id="birthday-error" className="field-error" aria-live="polite">{error}</p>
    </div>
  );
}
