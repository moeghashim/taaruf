import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import { ageFromDateOfBirth, calendarDay, validateDateOfBirth } from "./age";
type ReadCtx = QueryCtx | MutationCtx;
const CLOCK_KEY = "birthdayCalendarDay";
// No public DOB reader. Call only after owner authentication.
export async function ownerDateOfBirth(ctx: ReadCtx, registrationId: Id<"registrations">) {
  return (await ctx.db.query("registrationBirthdays").withIndex("by_registrationId", q => q.eq("registrationId", registrationId)).unique())?.dateOfBirth;
}
export async function saveDateOfBirth(ctx: MutationCtx, registrationId: Id<"registrations">, dateOfBirth: string | undefined) {
  if (dateOfBirth === undefined) return;
  const previous = await ctx.db.query("registrationBirthdays").withIndex("by_registrationId", q => q.eq("registrationId", registrationId)).unique();
  // Eligibility applies to changed birthdays, not members who naturally age past 99.
  if (previous?.dateOfBirth === dateOfBirth) return;
  const age = validateDateOfBirth(dateOfBirth);
  if (previous) await ctx.db.patch(previous._id, { dateOfBirth });
  else await ctx.db.insert("registrationBirthdays", { registrationId, dateOfBirth });
  await ctx.db.patch(registrationId, { age });
}
export async function currentAge(ctx: ReadCtx, registration: Doc<"registrations">) {
  // Reading this singleton makes subscribed queries rerun when Chicago's day changes.
  await ctx.db.query("settings").withIndex("by_key", q => q.eq("key", CLOCK_KEY)).unique();
  const birthday = await ownerDateOfBirth(ctx, registration._id);
  return birthday === undefined ? registration.age : ageFromDateOfBirth(birthday);
}
export async function withCurrentAge<T extends Doc<"registrations"> | null>(ctx: ReadCtx, registration: T): Promise<T> {
  return registration ? { ...registration, age: await currentAge(ctx, registration) } : registration;
}
/** Small clock write, no bulk profile rewrite; existing cron jobs remain untouched. */
export const tick = internalMutation({ args: {}, handler: async ctx => {
  const today = calendarDay();
  const row = await ctx.db.query("settings").withIndex("by_key", q => q.eq("key", CLOCK_KEY)).unique();
  if (!row) await ctx.db.insert("settings", { key: CLOCK_KEY, value: today });
  else if (row.value !== today) await ctx.db.patch(row._id, { value: today });
} });
