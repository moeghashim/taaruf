import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { isSecurityRetired } from "./registrationSecurity";
type ReadCtx = MutationCtx | QueryCtx;
type Interest = Doc<"interests">;

/** Exact directional reads serialize sends, explicit shares, and withdrawals.
 * Eligibility is read-only: submission never links or changes reciprocal consent. */
export async function pendingReciprocal(ctx: ReadCtx, from: Doc<"registrations">, to: Doc<"registrations">, eventId: Id<"events">) {
  const ranges = await Promise.all([[from._id, to._id], [to._id, from._id]].map(([a,b]) => ctx.db.query("interests").withIndex("by_fromRegistrationId_and_toRegistrationId_and_eventId", q => q.eq("fromRegistrationId", a).eq("toRegistrationId", b).eq("eventId", eventId)).take(3)));
  const event = await ctx.db.get(eventId);
  if (!event || event.status === "cancelled" || ranges.some(rows => rows.length > 1) || [from,to].some(p => p.status !== "approved" || p.archivedAt !== undefined || isSecurityRetired(p) || p.activeMatchId)) return null;
  for (const row of ranges.flat()) {
    if (row.source !== "platform_submission" || row.canonicalInterestId || row.testReset || row.matchId || row.slotReturnedAt !== undefined || !["new", "queued"].includes(row.status) || (row.adminStatus ?? "pending") !== "pending" || [from,to].some(p => p.lastRestoredArchivedAt !== undefined && row.createdAt <= p.lastRestoredArchivedAt)) return null;
    const w = row.femaleWorkflow;
    if (w && (w.state !== "private_documented" || w.reviewTokenHash || w.brotherAcceptedAt !== undefined || w.sisterConfirmedAt !== undefined || w.adminReleasedAt !== undefined)) return null;
    const f = await ctx.db.query("interestFlows").withIndex("by_interestId", q => q.eq("interestId", row._id)).unique();
    if (!f || f.fromRegistrationId !== row.fromRegistrationId || f.toRegistrationId !== row.toRegistrationId || !["private_documented", "awaiting_inbound_response"].includes(f.flowStatus) || f.recipientDecision !== "pending" || f.requesterFinalApproval !== "pending" || f.recipientFinalApproval !== "pending" || f.bioVisibleAt !== undefined || f.contactSharedAt !== undefined || f.requesterExplicitFinalAt !== undefined || f.recipientExplicitFinalAt !== undefined || f.photoDecision !== "pending" || f.photoRequestedByRegistrationId !== undefined || f.requesterFinalApprovalAt !== undefined || f.recipientFinalApprovalAt !== undefined || f.photosVisibleAt !== undefined || f.photoRequestedAt !== undefined || f.photoDecisionAt !== undefined || f.keepOpenExpiresAt !== undefined || f.closedReason !== undefined) return null;
  }
  return { own: ranges[0][0] ?? null, reverse: ranges[1][0] ?? null };
}
export async function linkPendingReciprocal(ctx: MutationCtx, created: Interest, reverse: Interest | null) {
  if (!reverse) return false;
  const sister = created.femaleWorkflow ? created : reverse;
  const brother = created.femaleWorkflow ? reverse : created;
  if (!sister.femaleWorkflow || brother.femaleWorkflow) throw new Error("Invalid reciprocal pair");
  await ctx.db.patch(brother._id, { canonicalInterestId: sister._id, canonicalizedAt: Date.now() });
  return true;
}
export async function aliases(ctx: ReadCtx, canonical: Interest) {
  return await ctx.db.query("interests").withIndex("by_canonicalInterestId", q => q.eq("canonicalInterestId", canonical._id)).take(3);
}
export async function assertCanonicalAction(ctx: ReadCtx, row: Interest) {
  if (row.canonicalInterestId) throw new Error("Connection unavailable");
  const linked = await aliases(ctx, row);
  if (linked.length > 1 || linked.some(a => a.testReset || ["withdrawn", "closed", "declined"].includes(a.status))) throw new Error("Connection unavailable");
}
export async function sharedMutual(ctx: ReadCtx, row: Interest) {
  if (!row.femaleWorkflow?.reviewTokenHash || row.femaleWorkflow.state === "private_documented" || row.canonicalInterestId) return false;
  const linked = await aliases(ctx, row);
  return linked.length === 1 && linked[0].eventId === row.eventId && linked[0].fromRegistrationId === row.toRegistrationId && linked[0].toRegistrationId === row.fromRegistrationId && !linked[0].testReset && !["withdrawn", "closed", "declined"].includes(linked[0].status);
}
