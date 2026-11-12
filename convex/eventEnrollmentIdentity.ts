import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx, MutationCtx } from "./_generated/server";
type ReadCtx = QueryCtx | MutationCtx;
type Enrollment = Doc<"eventRegistrations">;
export function isCurrentEnrollment(row: Enrollment) { return row.supersededBy === undefined; }
export function enrollmentRegistrationId(row: Enrollment) { return row.mergedIntoRegistrationId ?? row.registrationId; }
export function requireCurrentEnrollment(row: Enrollment | null): asserts row is Enrollment {
  if (!row || !isCurrentEnrollment(row)) throw new Error("Event registration not found or superseded");
}
/** Resolve the effective owner without ever rewriting historical registrationId. */
export async function enrollmentForEvent(ctx: ReadCtx, eventId: Id<"events">, registrationId: Id<"registrations">) {
  const original = await ctx.db.query("eventRegistrations").withIndex("by_eventId_and_registrationId", q => q.eq("eventId", eventId).eq("registrationId", registrationId)).take(101);
  const associated = await ctx.db.query("eventRegistrations").withIndex("by_eventId_and_mergedIntoRegistrationId", q => q.eq("eventId", eventId).eq("mergedIntoRegistrationId", registrationId)).take(101);
  if (original.length > 100 || associated.length > 100) throw new Error("Enrollment history requires review");
  const rows = [...new Map([...original, ...associated].filter(row => isCurrentEnrollment(row) && enrollmentRegistrationId(row) === registrationId).map(row => [row._id, row])).values()];
  if (rows.length > 1) throw new Error("Multiple current enrollments require reconciliation");
  return rows[0] ?? null;
}
export async function enrollmentsForRegistration(ctx: ReadCtx, registrationId: Id<"registrations">) {
  const original = await ctx.db.query("eventRegistrations").withIndex("by_registrationId", q => q.eq("registrationId", registrationId)).take(1001);
  const associated = await ctx.db.query("eventRegistrations").withIndex("by_mergedIntoRegistrationId", q => q.eq("mergedIntoRegistrationId", registrationId)).take(1001);
  if (original.length > 1000 || associated.length > 1000) throw new Error("Enrollment history requires pagination");
  return [...new Map([...original, ...associated].filter(row => isCurrentEnrollment(row) && enrollmentRegistrationId(row) === registrationId).map(row => [row._id, row])).values()];
}
