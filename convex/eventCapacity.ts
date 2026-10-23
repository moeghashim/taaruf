import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
type ReadCtx = QueryCtx | MutationCtx;
type Gender = "male" | "female";
type EventRegistration = Doc<"eventRegistrations">;
export function requireEventAdmin(secret: string) {
  if (!process.env.ATTENDANCE_ADMIN_SECRET || secret !== process.env.ATTENDANCE_ADMIN_SECRET) throw new Error("Unauthorized");
}
export function reservesCapacity(status: EventRegistration["registrationStatus"]) { return status === "pending" || status === "approved"; }
export async function countCapacityUsed(ctx: ReadCtx, eventId: Id<"events">, gender: Gender) {
  let used = 0;
  for (const status of ["pending", "approved"] as const) {
    for await (const row of ctx.db.query("eventRegistrations").withIndex("by_eventId_and_gender_and_registrationStatus", q => q.eq("eventId", eventId).eq("gender", gender).eq("registrationStatus", status))) { if (row) used++; }
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
  const available = eventCapacityForGender(event, gender) - await countCapacityUsed(ctx, eventId, gender);
  if (available <= 0) return;
  const queued = [];
  for await (const row of ctx.db.query("eventRegistrations").withIndex("by_eventId_and_gender_and_registrationStatus", q => q.eq("eventId", eventId).eq("gender", gender).eq("registrationStatus", "waitlisted"))) queued.push(row);
  queued.sort((a, b) => (a.waitlistedAt ?? a.createdAt) - (b.waitlistedAt ?? b.createdAt) || a._creationTime - b._creationTime || String(a._id).localeCompare(String(b._id)));
  for (const row of queued.slice(0, available)) await ctx.db.patch(row._id, { registrationStatus: "pending", approvedAt: undefined, updatedAt: Date.now() });
}
