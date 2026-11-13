import { isSecurityRetired } from "./registrationSecurity";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { assertMatchInterest, linkedFlows } from "./contactGate";
import { active } from "./femaleInterestWorkflow";

/** Recipient-authorized, exact-event lookup. Hidden submissions are indistinguishable
 * from absence. No writes: in particular no consent, quota, grant or delivery changes. */
export async function existingInboundReview(ctx: MutationCtx, viewer: Doc<"registrations">, sender: Doc<"registrations">, eventId: Id<"events">) {
  const rows = await ctx.db.query("interests").withIndex("by_fromRegistrationId_and_toRegistrationId_and_eventId", q => q.eq("fromRegistrationId", sender._id).eq("toRegistrationId", viewer._id).eq("eventId", eventId)).collect();
  if (isSecurityRetired(viewer) || isSecurityRetired(sender)) return null;
  if (viewer.status !== "approved" || sender.status !== "approved" || viewer.archivedAt !== undefined || sender.archivedAt !== undefined) return null;
  for (const row of rows) {
    if (row.canonicalInterestId || row.testReset || ["closed", "declined", "withdrawn"].includes(row.status) || [viewer, sender].some(p => p.lastRestoredArchivedAt !== undefined && row.createdAt <= p.lastRestoredArchivedAt)) continue;
    const flow = await ctx.db.query("interestFlows").withIndex("by_interestId", q => q.eq("interestId", row._id)).unique();
    if (!flow || flow.fromRegistrationId !== sender._id || flow.toRegistrationId !== viewer._id || ["closed", "declined"].includes(flow.flowStatus)) continue;
    if (row.femaleWorkflow) {
      const w = row.femaleWorkflow;
      if (viewer.gender !== "male" || w.state === "private_documented" || !w.reviewTokenHash || ["revoked", "declined"].includes(w.state)) continue;
      try { await active(ctx, row._id, true); } catch { continue; }
      // Expired invitations remain known history, but are not actionable reviews.
      if (w.state === "awaiting_brother_review" && (!w.reviewExpiresAt || w.reviewExpiresAt <= Date.now())) continue;
      return { interestId: row._id, route: "femaleReview" as const };
    }
    if (row.visibility === "internal_only") continue;
    if (row.matchId) {
      const match = await ctx.db.get(row.matchId);
      if (!match || match.testResetAt !== undefined || ["closed", "declined"].includes(match.status) || ![match.maleRegistrationId, match.femaleRegistrationId].includes(sender._id) || ![match.maleRegistrationId, match.femaleRegistrationId].includes(viewer._id)) continue;
      try { assertMatchInterest(match, row); await linkedFlows(ctx, row); } catch { continue; }
    }
    return { interestId: row._id, route: "connection" as const };
  }
  return null;
}
