import { sessionAllowed } from "./capabilitySecurity";
import { requireAdmin } from "./adminAuthorization";
import { v } from "convex/values";
import { mutation, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { promoteWaitlist, requireEventAdmin, reservesCapacity, confirmationExpired } from "./eventCapacity";

// One transaction: OCC retries cannot leave an archived participant active or
// promote a seat twice. No deletion, refunds, outbound email, or restoration.
async function archiveParticipant(ctx: MutationCtx, registration: Doc<"registrations">, expectedArchivedAt: number | null, actor: "participant" | "admin", expectedRestoredArchivedAt?: number) {
  const current = registration.archivedAt ?? null;
  if (expectedRestoredArchivedAt !== registration.lastRestoredArchivedAt) throw new Error("Archive state changed; refresh and try again");
  // A retry of the initial (null) intent is idempotent; a different timestamp is stale.
  if (expectedArchivedAt !== null && expectedArchivedAt !== current) throw new Error("Archive state changed; refresh and try again");
  if (current !== null) return { registrationId: registration._id, archivedAt: current };
  const now = Math.max(Date.now(), (registration.lastRestoredArchivedAt ?? -1) + 1);
  await ctx.db.patch(registration._id, {
    archivedAt: now, archivedBy: actor,
    archivedByRegistrationId: actor === "participant" ? registration._id : undefined,
    activeMatchId: undefined,
  });

  for (const index of ["by_maleRegistrationId", "by_femaleRegistrationId"] as const) {
    const field = index === "by_maleRegistrationId" ? "maleRegistrationId" : "femaleRegistrationId";
    for await (const match of ctx.db.query("matches").withIndex(index, q => q.eq(field, registration._id))) {
      if (match.status === "closed" || match.status === "declined") continue;
      await ctx.db.patch(match._id, { status: "closed", closedReason: "participant_archived", followUpNeeded: false, updatedAt: now });
      for (const recipientId of [match.maleRegistrationId, match.femaleRegistrationId]) {
        const notification = await ctx.db.query("matchmakerNotifications").withIndex("by_key", q => q.eq("key", "matchmaker:" + match._id + ":" + recipientId)).unique();
        if (notification && ["pending", "claimed"].includes(notification.status)) await ctx.db.patch(notification._id, {status: "failed", completedAt: now});
      }
      for (const id of [match.maleRegistrationId, match.femaleRegistrationId]) {
        const member = await ctx.db.get(id);
        if (member?.activeMatchId === match._id) await ctx.db.patch(id, { activeMatchId: undefined });
      }
    }
  }
  for (const index of ["by_fromRegistrationId", "by_toRegistrationId"] as const) {
    const field = index === "by_fromRegistrationId" ? "fromRegistrationId" : "toRegistrationId";
    for await (const interest of ctx.db.query("interests").withIndex(index, q => q.eq(field, registration._id))) {
      if (!["closed", "declined", "withdrawn"].includes(interest.status)) {
        await ctx.db.patch(interest._id, { status: "closed", updatedAt: now });
        for await (const delivery of ctx.db.query("femaleWorkflowDeliveries").withIndex("by_interestId", q => q.eq("interestId", interest._id))) {
          if (["pending", "sending"].includes(delivery.status)) await ctx.db.patch(delivery._id, {status: "cancelled", leaseUntil: undefined, error: "Participant archived"});
        }
      }
    }
  }
  for (const index of ["by_fromRegistrationId_and_flowStatus", "by_toRegistrationId_and_flowStatus"] as const) {
    const field = index === "by_fromRegistrationId_and_flowStatus" ? "fromRegistrationId" : "toRegistrationId";
    for await (const flow of ctx.db.query("interestFlows").withIndex(index, q => q.eq(field, registration._id))) {
      if (flow.flowStatus === "closed" || flow.flowStatus === "declined") continue;
      await ctx.db.patch(flow._id, { flowStatus: "closed", closedReason: "participant_archived", updatedAt: now });
      await ctx.db.insert("interestFlowEvents", {
        interestFlowId: flow._id, interestId: flow.interestId,
        actor: actor === "participant" ? "applicant" : "admin",
        actorRegistrationId: actor === "participant" ? registration._id : undefined,
        eventType: "participant_archived", message: "Closed because a participant archived their account.", createdAt: now,
      });
    }
  }
  for (const index of ["by_ownerRegistrationId", "by_recipientRegistrationId"] as const) {
    const field = index === "by_ownerRegistrationId" ? "ownerRegistrationId" : "recipientRegistrationId";
    for await (const share of ctx.db.query("profileShares").withIndex(index, q => q.eq(field, registration._id))) {
      if (share.status !== "closed" && share.status !== "declined") await ctx.db.patch(share._id, { status: "closed", updatedAt: now });
    }
  }
  const released: Doc<"eventRegistrations">[] = [];
  for await (const row of ctx.db.query("eventRegistrations").withIndex("by_registrationId", q => q.eq("registrationId", registration._id))) {
    const event = await ctx.db.get(row.eventId);
    if (!event || event.startsAt <= now || event.endsAt <= now || event.status === "completed" || event.status === "cancelled") continue;
    if (!["pending", "approved", "waitlisted"].includes(row.registrationStatus)) continue;
    await ctx.db.patch(row._id, { registrationStatus: "withdrawn", confirmationStatus: "cancelled", cancelledAt: now, updatedAt: now });
    if (reservesCapacity(row.registrationStatus) && !confirmationExpired(row, now)) released.push(row);
  }
  for await (const row of ctx.db.query("eventWaitlistEntries").withIndex("by_registrationId_and_status", q => q.eq("registrationId", registration._id).eq("status", "active"))) {
    const event = await ctx.db.get(row.eventId);
    if (!event || event.startsAt <= now || event.endsAt <= now || event.status === "completed" || event.status === "cancelled") continue;
    await ctx.db.patch(row._id, { status: "removed", removedAt: now, updatedAt: now });
  }
  for (const row of released) await promoteWaitlist(ctx, row.eventId, row.gender);
  return { registrationId: registration._id, archivedAt: now };
}

export const archiveOwn = mutation({
  args: { adminSecret: v.string(), sessionHash: v.string(), expectedArchivedAt: v.union(v.number(), v.null()), expectedRestoredArchivedAt: v.optional(v.number()), confirm: v.literal(true) },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    const session = await ctx.db.query("applicantSessions").withIndex("by_sessionHash", q => q.eq("sessionHash", args.sessionHash)).unique();
    if (!(await sessionAllowed(ctx, session)) || !session) throw new Error("Unauthorized");
    const registration = await ctx.db.get(session.registrationId);
    if (!registration) throw new Error("Unauthorized");
    return archiveParticipant(ctx, registration, args.expectedArchivedAt, "participant", args.expectedRestoredArchivedAt);
  },
});
export const archiveAdmin = mutation({
  args: { adminSecret: v.string(), registrationId: v.id("registrations"), expectedArchivedAt: v.union(v.number(), v.null()), expectedRestoredArchivedAt: v.optional(v.number()), confirm: v.literal(true) },
  handler: async (ctx, args) => {
    requireEventAdmin(args.adminSecret);
    const registration = await ctx.db.get(args.registrationId);
    if (!registration) throw new Error("Profile not found");
    return archiveParticipant(ctx, registration, args.expectedArchivedAt, "admin", args.expectedRestoredArchivedAt);
  },
});

// Clearing only the archive flag restores availability, never workflow state or consent.
async function restoreParticipant(ctx: MutationCtx, registration: Doc<"registrations">, expectedArchivedAt: number) {
  if (registration.archivedAt === undefined && registration.lastRestoredArchivedAt === expectedArchivedAt) return { registrationId: registration._id, archivedAt: null };
  if (registration.archivedAt !== expectedArchivedAt) throw new Error("Archive state changed; refresh and try again");
  await ctx.db.patch(registration._id, { archivedAt: undefined, archivedBy: undefined, archivedByRegistrationId: undefined, lastRestoredArchivedAt: expectedArchivedAt });
  return { registrationId: registration._id, archivedAt: null };
}
export const restoreOwn = mutation({
  args: { adminSecret: v.string(), sessionHash: v.string(), expectedArchivedAt: v.number(), confirm: v.literal(true) },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    const session = await ctx.db.query("applicantSessions").withIndex("by_sessionHash", q => q.eq("sessionHash", args.sessionHash)).unique();
    if (!session || !await sessionAllowed(ctx, session)) throw new Error("Unauthorized");
    const registration = await ctx.db.get(session.registrationId);
    if (!registration) throw new Error("Unauthorized");
    return restoreParticipant(ctx, registration, args.expectedArchivedAt);
  },
});
export const restoreAdmin = mutation({
  args: { adminSecret: v.string(), registrationId: v.id("registrations"), expectedArchivedAt: v.number(), confirm: v.literal(true) },
  handler: async (ctx, args) => {
    requireEventAdmin(args.adminSecret);
    const registration = await ctx.db.get(args.registrationId);
    if (!registration) throw new Error("Profile not found");
    return restoreParticipant(ctx, registration, args.expectedArchivedAt);
  },
});
