import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { ownClosedDecision } from "./ownClosedConnection";

// Policy5800 permits ONLY this anonymous boolean. No IDs, counts, timestamps,
// actor/profile fields or audit records cross the applicant boundary.
export async function hasOutboundDecline(ctx: QueryCtx, outgoing: Doc<"interests">[], viewer: Id<"registrations">): Promise<boolean> {
  for (const submission of outgoing) {
    if (submission.fromRegistrationId !== viewer || submission.toRegistrationId === viewer || submission.testReset || submission.slotReturnedAt !== undefined || submission.status === "withdrawn") continue;
    const row = submission.canonicalInterestId ? await ctx.db.get(submission.canonicalInterestId) : submission;
    if (!row || row.testReset || row.canonicalInterestId || row.status !== "declined" || row.slotReturnedAt !== undefined) continue;
    if (row.eventId) { const event = await ctx.db.get(row.eventId); if (!event || event.status === "cancelled") continue; }
    if (row.matchId) { const match = await ctx.db.get(row.matchId); if (!match || match.testResetAt !== undefined) continue; }
    const aliases = await ctx.db.query("interests").withIndex("by_canonicalInterestId", q => q.eq("canonicalInterestId", row._id)).take(2);
    if (aliases.length) {
      const alias = aliases[0];
      if (aliases.length !== 1 || !row.femaleWorkflow?.reviewTokenHash || alias.testReset || alias.slotReturnedAt !== undefined || alias.status === "withdrawn" || alias.canonicalizedAt === undefined || alias.eventId !== row.eventId || alias.fromRegistrationId !== row.toRegistrationId || alias.toRegistrationId !== row.fromRegistrationId) continue;
      if (submission.canonicalInterestId && alias._id !== submission._id) continue;
    } else if (submission.canonicalInterestId) continue;
    const counterpart = submission.toRegistrationId;
    if (![row.fromRegistrationId, row.toRegistrationId].includes(viewer) || ![row.fromRegistrationId, row.toRegistrationId].includes(counterpart)) continue;
    const flow = await ctx.db.query("interestFlows").withIndex("by_interestId", q => q.eq("interestId", row._id)).unique();
    // Existing receipt validates latest lifecycle, exact actor, final timestamp,
    // row/flow consistency and ambiguous legacy histories. Own history is unchanged.
    if (await ownClosedDecision(ctx, row, flow, counterpart) === "declined") return true;
  }
  return false;
}
