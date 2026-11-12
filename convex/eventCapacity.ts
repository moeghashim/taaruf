import { isCurrentEnrollment, enrollmentRegistrationId } from "./eventEnrollmentIdentity";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { canReceiveEventMessages } from "./eventMessagingEligibility";
type ReadCtx = QueryCtx | MutationCtx;
type Gender = "male" | "female";
type EventRegistration = Doc<"eventRegistrations">;
export function requireEventAdmin(secret: string) {
  if (!process.env.ATTENDANCE_ADMIN_SECRET || secret !== process.env.ATTENDANCE_ADMIN_SECRET) throw new Error("Unauthorized");
}
export function reservesCapacity(status: EventRegistration["registrationStatus"]) { return status === "pending" || status === "approved"; }
export function confirmationExpired(row: EventRegistration, now: number): boolean {
  return isCurrentEnrollment(row) && row.confirmationStatus === "not_confirmed" && row.confirmationExpiresAt !== undefined && row.confirmationExpiresAt < now && !row.confirmedAt && (reservesCapacity(row.registrationStatus) || row.registrationStatus === "waitlisted");
}
export async function countCapacityUsed(ctx: ReadCtx, eventId: Id<"events">, gender: Gender) {
  let used = 0;
  const now = Date.now();
  for (const status of ["pending", "approved"] as const) {
    for await (const row of ctx.db.query("eventRegistrations").withIndex("by_eventId_and_gender_and_registrationStatus", q => q.eq("eventId", eventId).eq("gender", gender).eq("registrationStatus", status))) { if (isCurrentEnrollment(row) && !confirmationExpired(row, now)) used++; }
  }
  return used;
}
export function eventCapacityForGender(event: Doc<"events">, gender: Gender) { return gender === "male" ? event.maleCapacity : event.femaleCapacity; }
export async function registrationStatusForCapacity(ctx: ReadCtx, event: Doc<"events">, gender: Gender) {
  return await countCapacityUsed(ctx, event._id, gender) < eventCapacityForGender(event, gender) ? "pending" as const : "waitlisted" as const;
}
// Atomic range reads participate in Convex OCC; promotion never consults profile approval.
export async function promoteWaitlist(ctx: MutationCtx, eventId: Id<"events">, gender: Gender) {
  const event = await ctx.db.get(eventId);
  if (!event || event.status === "cancelled" || event.status === "completed") return;
  const now = Date.now();
  const queued = [];
  for (const status of ["pending", "approved", "waitlisted"] as const) {
    for await (const row of ctx.db.query("eventRegistrations").withIndex("by_eventId_and_gender_and_registrationStatus", q => q.eq("eventId", eventId).eq("gender", gender).eq("registrationStatus", status))) {
      if (!isCurrentEnrollment(row)) continue;
      if (confirmationExpired(row, now)) await ctx.db.patch(row._id, { registrationStatus: "withdrawn", confirmationStatus: "cancelled", cancelledAt: now, updatedAt: now });
      else if (status === "waitlisted") queued.push(row);
    }
  }
  const available = eventCapacityForGender(event, gender) - await countCapacityUsed(ctx, eventId, gender);
  if (available <= 0) return;
  queued.sort((a, b) => (a.waitlistedAt ?? a.createdAt) - (b.waitlistedAt ?? b.createdAt) || a._creationTime - b._creationTime || String(a._id).localeCompare(String(b._id)));
  let promoted = 0;
  for (const row of queued) {
    if (promoted >= available) break;
    const registration = await ctx.db.get(enrollmentRegistrationId(row));
    if (!registration || registration.archivedAt !== undefined || !canReceiveEventMessages(registration) || registration.profileCompletionStatus !== "completed" || registration.gender !== gender || row.confirmationStatus === "cancelled") continue;
    await ctx.db.patch(row._id, { registrationStatus: "pending", approvedAt: undefined, updatedAt: Date.now() });
    promoted++;
  }
}
