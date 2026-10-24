/** Persisted values are stable; labels are shared by signup, editors and displays. */
export const educationOptions = [
  { value: "highSchool", label: "High School" },
  { value: "associate", label: "Associate’s degree" },
  { value: "trade_school", label: "Trade school" },
  { value: "bachelor", label: "Bachelor's" },
  { value: "master", label: "Master's" },
  { value: "phd", label: "PhD" },
  { value: "jd", label: "JD" },
  { value: "md_do", label: "MD/DO" },
  { value: "md_phd", label: "MD/PhD" },
  { value: "jd_phd", label: "JD/PhD" },
  { value: "other", label: "Other" },
] as const;
export type Education = (typeof educationOptions)[number]["value"];
export function isEducation(value: unknown): value is Education {
  return educationOptions.some((option) => option.value === value);
}
/** Unknown historic strings are displayed verbatim, never silently remapped. */
export function formatEducation(value?: string | null): string {
  return educationOptions.find((option) => option.value === value)?.label || value || "—";
}
export function educationOptionsFor(current?: string) {
  return current && !isEducation(current)
    ? [...educationOptions, { value: current, label: current }]
    : educationOptions;
}
/** Omission and an unchanged historic value are backwards-compatible updates. */
export function validateEducationUpdate(value: unknown, current: string): void {
  if (value !== undefined && value !== current && !isEducation(value)) {
    throw new Error("Invalid education level");
  }
}
