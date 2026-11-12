/** Calendar birthdays use the community timezone, not the host timezone. */
export const AGE_TIME_ZONE = "America/Chicago";
export function calendarDay(now: number = Date.now()): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: AGE_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return part("year") + "-" + part("month") + "-" + part("day");
}
function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
/** Feb 29 birthdays advance on March 1 in non-leap years. */
export function ageFromDateOfBirth(dateOfBirth: string, today: string = calendarDay()): number {
  if (!validDate(dateOfBirth) || !validDate(today) || dateOfBirth > today) throw new Error("Enter a valid date of birth");
  return Number(today.slice(0, 4)) - Number(dateOfBirth.slice(0, 4)) - (today.slice(5) < dateOfBirth.slice(5) ? 1 : 0);
}
export function validateDateOfBirth(dateOfBirth: string, today: string = calendarDay()): number {
  const age = ageFromDateOfBirth(dateOfBirth, today);
  if (age < 18 || age > 99) throw new Error("Age must be between 18 and 99");
  return age;
}
