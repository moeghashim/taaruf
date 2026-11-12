import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { interestBioVisible } from "./bioVisibility";
import { active } from "./femaleInterestWorkflow";
import { deliveryConfig } from "./femaleWorkflowDelivery";

export const FINAL_REQUEST_MODE = "brother-final-request-production";
export const FINAL_REQUEST_ACTIVATION_KEY = "finalRequestEmailActivatedAt";
export function finalRequestEnabled() { return process.env.FEMALE_WORKFLOW_EMAIL_MODE === FINAL_REQUEST_MODE; }
export async function finalActivation(ctx: MutationCtx | QueryCtx) {
  const row = await ctx.db.query("settings").withIndex("by_key", q => q.eq("key", FINAL_REQUEST_ACTIVATION_KEY)).unique();
  const at = Number(row?.value);
  return row && Number.isSafeInteger(at) && at > 0 && at <= Date.now() ? at : null;
}
/** Own pending action only. Never gate or trigger on counterpart final consent. */
export async function finalParticipants(ctx: MutationCtx | QueryCtx, id: Id<"interests">, recipientId: Id<"registrations">) {
  const interest = await ctx.db.get(id);
  if (!interest || ![interest.fromRegistrationId, interest.toRegistrationId].includes(recipientId) || !await interestBioVisible(ctx, interest)) throw new Error("Final review unavailable");
  const from = await ctx.db.get(interest.fromRegistrationId), to = await ctx.db.get(interest.toRegistrationId);
  if (!from || !to || from.gender === to.gender || [from, to].some(p => p.status !== "approved" || p.archivedAt !== undefined || (p.lastRestoredArchivedAt !== undefined && interest.createdAt <= p.lastRestoredArchivedAt))) throw new Error("Applicants unavailable");
  const flow = await ctx.db.query("interestFlows").withIndex("by_interestId", q => q.eq("interestId", id)).unique();
  if (!flow || flow.contactSharedAt !== undefined || ["closed", "declined", "contact_shared"].includes(flow.flowStatus)) throw new Error("Final review unavailable");
  const requester = recipientId === from._id;
  let own = requester ? flow.requesterFinalApproval : flow.recipientFinalApproval;
  if (interest.femaleWorkflow) {
    const { workflow } = await active(ctx, id);
    if (interest.matchId || workflow.state !== "awaiting_sister_confirmation" || !workflow.reviewTokenHash) throw new Error("Final review unavailable");
    // Male review expires; sister's authenticated final action has no token TTL.
    if (!requester && (!workflow.reviewExpiresAt || workflow.reviewExpiresAt <= Date.now())) throw new Error("Review expired");
    if (!requester && own === "approved" && flow.recipientExplicitFinalAt === undefined) own = "pending";
  } else {
    if (interest.visibility === "internal_only") throw new Error("Private interest");
    const match = interest.matchId ? await ctx.db.get(interest.matchId) : null;
    if (match?.status === "paused") throw new Error("Match paused");
  }
  if (own !== "pending") throw new Error("Own decision already recorded");
  return { interest, sister: from.gender === "female" ? from : to, brother: from.gender === "male" ? from : to, workflow: { state: "final_request" } };
}
export async function currentFinalRequest(ctx: MutationCtx | QueryCtx, row: Doc<"femaleWorkflowDeliveries">) {
  const data = await finalParticipants(ctx, row.interestId, row.recipientId);
  const recipient = row.recipientId === data.sister._id ? data.sister : data.brother;
  if (row.key !== row.interestId + ":final_request:" + row.recipientId || row.finalRecipientEmail !== recipient.email || (row.providerPayload && (row.providerPayload.to.length !== 1 || row.providerPayload.to[0] !== recipient.email))) throw new Error("Stale final recipient");
  return data;
}
/** Called only at the first initial-acceptance transition, including while disabled.
 * Durable negative rows prevent later retries/config changes from backfilling. */
export async function enqueueFinalRequests(ctx: MutationCtx, interestId: Id<"interests">) {
  const interest = (await ctx.db.get(interestId))!;
  const at = await finalActivation(ctx), now = Date.now();
  for (const recipientId of [interest.fromRegistrationId, interest.toRegistrationId]) {
    const key = interestId + ":final_request:" + recipientId;
    if (await ctx.db.query("femaleWorkflowDeliveries").withIndex("by_key", q => q.eq("key", key)).unique()) continue;
    const recipient = await ctx.db.get(recipientId);
    let actionable = false;
    try { await finalParticipants(ctx, interestId, recipientId); actionable = true; } catch { /* negative tombstone */ }
    const ready = actionable && finalRequestEnabled() && process.env.FEMALE_WORKFLOW_PRODUCTION_APPROVED === "true" && at !== null && now > at && !!recipient && !!deliveryConfig(recipient.email);
    await ctx.db.insert("femaleWorkflowDeliveries", { interestId, recipientId, kind: "final_request", key, status: ready ? "pending" : "failed", attempts: 0, nextAttemptAt: now, createdAt: now, finalRecipientEmail: recipient?.email, ...(ready ? { finalActivationAt: at! } : { error: "Final request not activated/actionable at first availability; no backfill" }) });
  }
}
