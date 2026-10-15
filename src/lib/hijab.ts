export type HijabResponse = "yes" | "no" | "open" | "burqa" | "niqab" | "working_on_it" | "";

const femaleOptions = [
  { value: "burqa", label: "Yes, I wear Burqa" },
  { value: "niqab", label: "Yes, I wear Niqab" },
  { value: "yes", label: "Yes" },
  { value: "working_on_it", label: "Not yet, but I am working on it" },
  { value: "no", label: "No" },
] as const;
const maleOptions = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "open", label: "Open" },
] as const;

export function hijabQuestion(gender: string | undefined) {
  return gender === "female"
    ? "Do you currently wear/practice hijab?"
    : gender === "male"
      ? "Do you wish for your wife to wear hijab?"
      : "Please select your gender to answer the hijab question";
}

export function hijabOptions(gender: string | undefined, current?: string) {
  if (gender === "female") {
    // Keep the stored legacy value while using the approved female wording.
    return current === "open"
      ? [...femaleOptions, { value: "open", label: "Not yet, but I am working on it" }]
      : femaleOptions;
  }
  return gender === "male" ? maleOptions : [];
}

export function formatHijabResponse(value: string | null | undefined, gender?: string) {
  if (value === "open" && gender === "female") return "Not yet, but I am working on it";
  return [...femaleOptions, ...maleOptions].find((option) => option.value === value)?.label ?? value ?? "-";
}
