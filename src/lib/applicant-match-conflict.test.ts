import { expect, test } from "vitest";
import { isApplicantActiveMatchConflict } from "./applicant-match-conflict";
for (const message of ["Applicant already has an active match", "[Request ID: synthetic] Server Error\nUncaught Error: Applicant already has an active match\n    at guard (contactGate.ts:113)"]) test("recognizes exact guard " + message, () => {
  expect(isApplicantActiveMatchConflict(new Error(message))).toBe(true);
});
for (const message of ["Unauthorized", "Unavailable", "Applicant already has an active match with PRIVATE OTHER", "Network error", "Not Applicant already has an active match", "An applicant already has an active match. Review it before creating another."]) test("does not reclassify " + message, () => {
  expect(isApplicantActiveMatchConflict(new Error(message))).toBe(false);
});
test("does not classify untrusted arbitrary values", () => { for (const value of [null, {}, "Applicant already has an active match"]) expect(isApplicantActiveMatchConflict(value)).toBe(false); });
