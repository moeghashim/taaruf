import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
type ReadCtx = MutationCtx | QueryCtx;
/** Shared outbox retains its original table name for compatibility. */
export async function enqueueContactDelivery(ctx: MutationCtx, interestId: Id<"interests">, recipientId: Id<"registrations">, kind: Doc<"femaleWorkflowDeliveries">["kind"]) {
  const key = interestId + ":" + kind + ":" + recipientId;
  if (await ctx.db.query("femaleWorkflowDeliveries").withIndex("by_key", q => q.eq("key", key)).unique()) return;
  await ctx.db.insert("femaleWorkflowDeliveries", { interestId, recipientId, kind, key, status: "pending", attempts: 0, nextAttemptAt: Date.now(), createdAt: Date.now() });
}
/** Validate both directions of the link before trusting any consent metadata. */
export function assertMatchInterest(match: Doc<"matches">, interest: Doc<"interests">) {
  const { fromRegistrationId: from, toRegistrationId: to } = interest;
  if (from === to || match.maleRegistrationId === match.femaleRegistrationId ||
      interest.matchId !== match._id ||
      !((from === match.maleRegistrationId && to === match.femaleRegistrationId) ||
        (from === match.femaleRegistrationId && to === match.maleRegistrationId))) {
    throw new Error("Linked pair mismatch");
  }
}
export async function linkedFlows(ctx: ReadCtx, interest: Doc<"interests">) {
  if (interest.fromRegistrationId === interest.toRegistrationId) throw new Error("Linked pair mismatch");
  if (interest.matchId) {
    const match = await ctx.db.get(interest.matchId);
    if (!match) throw new Error("Linked match missing");
    assertMatchInterest(match, interest);
    const primary = match.interestId ? await ctx.db.get(match.interestId) : null;
    if (!primary) throw new Error("Linked interest missing");
    assertMatchInterest(match, primary);
  }
  const interests = interest.matchId ? await ctx.db.query("interests").withIndex("by_matchId", q => q.eq("matchId", interest.matchId)).collect() : [interest];
  const flows = [];
  for (const row of interests) {
    if (row.testReset || ["closed", "declined", "withdrawn"].includes(row.status)) throw new Error("Interest is no longer active");
    if (row.fromRegistrationId === row.toRegistrationId) throw new Error("Linked pair mismatch");
    if (!([interest.fromRegistrationId, interest.toRegistrationId].includes(row.fromRegistrationId) && [interest.fromRegistrationId, interest.toRegistrationId].includes(row.toRegistrationId))) throw new Error("Linked pair mismatch");
    const flow = await ctx.db.query("interestFlows").withIndex("by_interestId", q => q.eq("interestId", row._id)).unique();
    if (!flow) throw new Error("Linked flow missing; explicit consent required");
    if (flow.fromRegistrationId !== row.fromRegistrationId || flow.toRegistrationId !== row.toRegistrationId) throw new Error("Linked flow identity mismatch");
    if (flow) {
      if (["closed", "declined"].includes(flow.flowStatus)) throw new Error("Interest is no longer active");
      flows.push(flow);
    }
  }
  return flows;
}
export async function queuePendingReview(ctx: MutationCtx, matchId: Id<"matches">) {
  const match = await ctx.db.get(matchId);
  if (!match?.interestId || match.testResetAt || ["closed", "declined", "paused"].includes(match.status)) throw new Error("Match is not active");
  const interest = await ctx.db.get(match.interestId);
  if (!interest) throw new Error("Linked interest missing");
  assertMatchInterest(match, interest);
  const flows = await linkedFlows(ctx, interest);
  if (flows.some(f => f.requesterFinalApproval !== "approved" || f.recipientFinalApproval !== "approved")) throw new Error("Both applicants must give final approval");
  if (match.status === "contact_shared" || match.contactGate === "contacts_released") return;
  await ctx.db.patch(matchId, { status: "reviewing", contactGate: "pending_admin_approval", updatedAt: Date.now() });
  for (const id of [match.maleRegistrationId, match.femaleRegistrationId]) await enqueueContactDelivery(ctx, match.interestId, id, "pending_review");
}
/** Historical timestamp-only disclosure is not revoked. */
export async function contactsVisible(ctx: ReadCtx, interest: Doc<"interests">, flow: Doc<"interestFlows"> | null) {
  if (!flow?.contactSharedAt) return false;
  const match = interest.matchId ? await ctx.db.get(interest.matchId) : null;
  return !match?.contactGate || match.contactGate === "contacts_released";
}
export async function deliveryParticipants(ctx: ReadCtx, interestId: Id<"interests">) {
  const interest = await ctx.db.get(interestId);
  if (!interest || interest.testReset || ["closed", "declined", "withdrawn"].includes(interest.status)) throw new Error("Unavailable");
  const match = interest.matchId ? await ctx.db.get(interest.matchId) : null;
  if (!match || match.testResetAt || ["closed", "declined", "paused"].includes(match.status)) throw new Error("Unavailable");
  assertMatchInterest(match, interest);
  await linkedFlows(ctx, interest);
  const sister = await ctx.db.get(match.femaleRegistrationId);
  const brother = await ctx.db.get(match.maleRegistrationId);
  if (!sister || !brother || sister.status !== "approved" || brother.status !== "approved") throw new Error("Unavailable");
  return { sister, brother, workflow: { state: match.contactGate } };
}
