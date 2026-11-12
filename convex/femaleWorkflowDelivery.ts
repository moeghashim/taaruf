import { FINAL_REQUEST_MODE, FINAL_REQUEST_ACTIVATION_KEY, finalRequestEnabled, currentFinalRequest } from "./finalRequest";
import { SISTER_CONFIRMATION_ACTIVATION_KEY, SISTER_CONFIRMATION_MODE, currentSisterConfirmation } from "./sisterConfirmationActivation";
import { BROTHER_REVIEW_ACTIVATION_KEY, BROTHER_REVIEW_MODE, COMBINED_REVIEW_MODE, reviewKindEnabled, deliveryAuthorized } from "./brotherReviewActivation";
import { deliveryParticipants } from "./contactGate";
import { v } from "convex/values";
import { internalMutation, internalAction, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { active } from "./femaleInterestWorkflow";
import type { Doc, Id } from "./_generated/dataModel";

async function participants(ctx: MutationCtx, id: Id<"interests">) {
  const interest = await ctx.db.get(id);
  return interest?.femaleWorkflow ? await active(ctx, id, true) : await deliveryParticipants(ctx, id);
}
async function cooldown(ctx: MutationCtx) {
  // Indexed maximum is shared across every worker, including new pending rows.
  const latest = await ctx.db.query("femaleWorkflowDeliveries").withIndex("by_providerCooldownUntil").order("desc").first();
  return latest?.providerCooldownUntil ?? 0;
}
// Outbox lease plus provider idempotency covers action crashes after delivery.
// Explicit owner-approved operation only; never called by cron, enqueue, or deployment.
export const activateBrotherReview = internalMutation({ args: {}, handler: async ctx => {
  if (!reviewKindEnabled("brother_review") || !deliveryConfig("activation@example.invalid")) throw new Error("Dedicated review production configuration missing");
  const existing = await ctx.db.query("settings").withIndex("by_key", q => q.eq("key", BROTHER_REVIEW_ACTIVATION_KEY)).unique();
  if (existing) return existing.value;
  const value = String(Date.now());
  await ctx.db.insert("settings", { key: BROTHER_REVIEW_ACTIVATION_KEY, value });
  return value;
}});
export const activateSisterConfirmation = internalMutation({ args: {}, handler: async ctx => {
  if (!reviewKindEnabled("sister_confirmation") || !deliveryConfig("activation@example.invalid")) throw new Error("Dedicated sister production configuration missing");
  const existing = await ctx.db.query("settings").withIndex("by_key", q => q.eq("key", SISTER_CONFIRMATION_ACTIVATION_KEY)).unique();
  if (existing) return existing.value;
  const value = String(Date.now());
  await ctx.db.insert("settings", { key: SISTER_CONFIRMATION_ACTIVATION_KEY, value });
  return value;
}});
export const activateFinalRequests = internalMutation({ args: {}, handler: async ctx => {
  if (!finalRequestEnabled() || !deliveryConfig("activation@example.invalid")) throw new Error("Dedicated final request production configuration missing");
  const existing = await ctx.db.query("settings").withIndex("by_key", q => q.eq("key", FINAL_REQUEST_ACTIVATION_KEY)).unique();
  if (existing) return existing.value;
  const value = String(Date.now());
  await ctx.db.insert("settings", { key: FINAL_REQUEST_ACTIVATION_KEY, value });
  return value;
}});
function scopedKinds(): Array<Doc<"femaleWorkflowDeliveries">["kind"]> | null {
  const mode = process.env.FEMALE_WORKFLOW_EMAIL_MODE;
  if (mode === FINAL_REQUEST_MODE) return ["brother_review", "final_request"];
  if (mode === COMBINED_REVIEW_MODE) return ["brother_review", "sister_confirmation"];
  if (mode === SISTER_CONFIRMATION_MODE) return ["sister_confirmation"];
  if (mode === BROTHER_REVIEW_MODE) return ["brother_review"];
  return null;
}
export const claim = internalMutation({ args: {}, handler: async ctx => {
  const now = Date.now();
  if (await cooldown(ctx) > now) return [];
  const scoped = scopedKinds();
  const due = async (status: "pending" | "sending") => scoped
    ? (await Promise.all(scoped.map(kind => ctx.db.query("femaleWorkflowDeliveries").withIndex("by_kind_and_status_and_nextAttemptAt", q => q.eq("kind", kind).eq("status", status).lte("nextAttemptAt", now)).take(10)))).flat()
    : await ctx.db.query("femaleWorkflowDeliveries").withIndex("by_status_and_nextAttemptAt", q => q.eq("status", status).lte("nextAttemptAt", now)).take(10);
  const pending = await due("pending");
  const abandoned = await due("sending");
  const result = [];
  for (const row of [...pending, ...abandoned].sort((a, b) => a.nextAttemptAt - b.nextAttemptAt || a._creationTime - b._creationTime).slice(0, 10)) {
    if (row.resetAuditId !== undefined) continue;
    if (!await deliveryAuthorized(ctx, row)) { await ctx.db.patch(row._id, { status: "failed", leaseUntil: undefined, error: "Delivery not authorized by activation boundary/kind; no backfill" }); continue; }
    if (row.firstAttemptAt !== undefined && now - row.firstAttemptAt >= 23 * 3600000) { await ctx.db.patch(row._id, { status: "failed", error: "Idempotency window expired; manual reconciliation required" }); continue; }
    try {
      const { workflow, sister, brother } = await (row.kind === "final_request" ? currentFinalRequest(ctx, row) : participants(ctx, row.interestId));
      if (row.kind === "brother_review" && row.providerPayload && (row.providerPayload.to.length !== 1 || row.providerPayload.to[0] !== brother.email)) throw new Error("stale brother recipient");
      if (row.kind === "sister_confirmation") {
        const interest = await ctx.db.get(row.interestId);
        if (!interest || !currentSisterConfirmation(interest, row) || (row.sisterRecipientEmail !== undefined && row.sisterRecipientEmail !== sister.email) || (row.providerPayload && (row.providerPayload.to.length !== 1 || row.providerPayload.to[0] !== sister.email))) throw new Error("stale sister confirmation");
      }
      if ((row.kind === "brother_review" && (row.recipientId !== brother._id || workflow.state !== "awaiting_brother_review" || !("reviewTokenHash" in workflow) || !workflow.reviewTokenHash || !("reviewExpiresAt" in workflow) || !workflow.reviewExpiresAt || workflow.reviewExpiresAt <= Date.now())) || ![sister._id, brother._id].includes(row.recipientId) || (row.kind === "sister_confirmation" && (row.recipientId !== sister._id || workflow.state !== "awaiting_sister_confirmation")) || (row.kind === "pending_review" && workflow.state !== "pending_admin_approval" && workflow.state !== "contacts_released") || (row.kind === "contacts_ready" && workflow.state !== "contacts_released")) throw new Error("stale");
      const recipient = row.recipientId === sister._id ? sister : brother;
      const attempts = row.attempts + 1;
      await ctx.db.patch(row._id, { status: "sending", attempts, leaseUntil: now + 120000, nextAttemptAt: now + 120000 });
      result.push({ ...row, attempts, email: recipient.email });
    } catch { await ctx.db.patch(row._id, { status: "cancelled", error: "Workflow no longer available" }); }
  }
  return result;
}});
export const markAttempt = internalMutation({ args: { id: v.id("femaleWorkflowDeliveries"), attempt: v.number() }, handler: async (ctx, args) => {
  const row = await ctx.db.get(args.id);
  if (!row || row.resetAuditId !== undefined || row.status !== "sending" || row.attempts !== args.attempt) return false;
  if (!await deliveryAuthorized(ctx, row)) return false;
  const now = Date.now();
  if (row.leaseUntil === undefined || row.leaseUntil <= now) return false;
  if (row.firstAttemptAt !== undefined && now - row.firstAttemptAt >= 23 * 3600000) {
    await ctx.db.patch(row._id, { status: "failed", leaseUntil: undefined, error: "Idempotency window expired; manual reconciliation required" }); return false;
  }
  const until = await cooldown(ctx);
  if (until > now) { await ctx.db.patch(row._id, { status: "pending", leaseUntil: undefined, nextAttemptAt: until }); return false; }
  let email: string;
  let review = false;
  let recipientIsBrother = false;
  try {
    const { workflow, sister, brother } = await (row.kind === "final_request" ? currentFinalRequest(ctx, row) : participants(ctx, row.interestId));
      if (row.kind === "brother_review" && row.providerPayload && (row.providerPayload.to.length !== 1 || row.providerPayload.to[0] !== brother.email)) throw new Error("stale brother recipient");
      if (row.kind === "sister_confirmation") {
        const interest = await ctx.db.get(row.interestId);
        if (!interest || !currentSisterConfirmation(interest, row) || (row.sisterRecipientEmail !== undefined && row.sisterRecipientEmail !== sister.email) || (row.providerPayload && (row.providerPayload.to.length !== 1 || row.providerPayload.to[0] !== sister.email))) throw new Error("stale sister confirmation");
      }
    if ((row.kind === "brother_review" && (row.recipientId !== brother._id || workflow.state !== "awaiting_brother_review" || !("reviewTokenHash" in workflow) || !workflow.reviewTokenHash || !("reviewExpiresAt" in workflow) || !workflow.reviewExpiresAt || workflow.reviewExpiresAt <= Date.now())) || ![sister._id, brother._id].includes(row.recipientId) || (row.kind === "sister_confirmation" && (row.recipientId !== sister._id || workflow.state !== "awaiting_sister_confirmation")) || (row.kind === "pending_review" && workflow.state !== "pending_admin_approval" && workflow.state !== "contacts_released") || (row.kind === "contacts_ready" && workflow.state !== "contacts_released")) throw new Error("stale");
    recipientIsBrother = row.recipientId === brother._id;
    email = row.recipientId === sister._id ? sister.email : brother.email;
    review = Boolean((await ctx.db.get(row.interestId))?.femaleWorkflow);
  } catch { await ctx.db.patch(row._id, { status: "cancelled", error: "Workflow no longer available" }); return false; }
  const config = deliveryConfig(row.providerPayload?.to[0] ?? email);
  if (!config) { await ctx.db.patch(row._id, { status: "failed", leaseUntil: undefined, error: "Isolated delivery configuration missing or recipient not allowlisted" }); return false; }
  if (scopedKinds() && row.providerPayload && row.providerPayload.from !== config.from) {
    await ctx.db.patch(row._id, { status: "cancelled", leaseUntil: undefined, error: "Approved sender changed; manual reconciliation required" }); return false;
  }
  if (row.firstAttemptAt !== undefined && !row.providerPayload) {
    await ctx.db.patch(row._id, { status: "failed", leaseUntil: undefined, error: "Prior attempt has no immutable payload; manual reconciliation required" }); return false;
  }
  const subject = row.kind === "final_request" ? "Your final approval is needed" : row.kind === "brother_review" ? "New interest received in 1 Plus 1" : row.kind === "sister_confirmation" ? "This connection is awaiting your review" : row.kind === "pending_review" ? "Your connection is being reviewed" : "Your contacts are ready in the portal";
  const portal = new URL(config.portal);
  portal.pathname = review ? "/dashboard" : "/me";
  portal.searchParams.set(review ? "femaleReview" : "connection", row.interestId);
  const payload = row.providerPayload ?? { from: config.from, to: [email], subject, text: row.kind === "brother_review" ? "You have received a new interest in your 1 Plus 1 applicant portal.\n\nPlease log in to review it and choose whether to accept or decline. You can also leave it open while you decide.\n\nReview interest: " + portal.toString() : row.kind === "contacts_ready" && recipientIsBrother ? "You can now reach out to the sister using the contact details in your portal. A warm introduction is a lovely place to start. Open your portal: " + portal.toString() : row.kind === "sister_confirmation" ? "This connection is awaiting your review. Sign in to review his profile and explicitly confirm or decline. Opening this link does not approve or create a match. Review profile and respond: " + portal.toString() : subject + ". Sign in to view and take action: " + portal.toString() };
  await ctx.db.patch(row._id, { providerPayload: payload, firstAttemptAt: row.firstAttemptAt ?? now, error: payload.to[0] !== email ? "Recipient changed since first attempt; replaying frozen payload for reconciliation" : undefined });
  return payload;
}});
export const finish = internalMutation({ args: { id: v.id("femaleWorkflowDeliveries"), attempt: v.number(), success: v.boolean(), retry: v.boolean(), error: v.optional(v.string()), retryAfterMs: v.optional(v.number()), rateLimited: v.optional(v.boolean()) }, handler: async (ctx, args) => {
  const row = await ctx.db.get(args.id);
  if (!row) return null;
  // Retired epochs accept evidence only, never workflow writes, retries or
  // sibling/cooldown changes. Keep the original frozen payload/errors intact.
  if (row.resetAuditId !== undefined) {
    // Preserve every callback, including superseded attempts and duplicate
    // callbacks, separately from the convenience latest-outcome summary.
    await ctx.db.insert("retiredDeliveryResults", { deliveryId: row._id, resetAuditId: row.resetAuditId, attempt: args.attempt, success: args.success, receivedAt: Date.now(), ...(args.error !== undefined ? { error: args.error } : {}), ...(args.rateLimited !== undefined ? { rateLimited: args.rateLimited } : {}), ...(args.retryAfterMs !== undefined ? { retryAfterMs: args.retryAfterMs } : {}) });
    if (row.attempts === args.attempt && row.firstAttemptAt !== undefined && row.providerPayload && (!row.lateResult || (!row.lateResult.success && args.success))) {
      await ctx.db.patch(row._id, { lateResult: { attempt: args.attempt, success: args.success, receivedAt: Date.now(), ...(args.error ? { error: args.error } : {}) } });
    }
    return null;
  }
  // Even a late 429 fences other workers; no stale response can complete a newer attempt.
  if (args.rateLimited) {
    const until = Math.max(await cooldown(ctx), Date.now() + Math.max(60000, args.retryAfterMs ?? 0));
    await ctx.db.patch(row._id, { providerCooldownUntil: until });
    const siblings = await ctx.db.query("femaleWorkflowDeliveries").withIndex("by_status_and_nextAttemptAt", q => q.eq("status", "sending")).take(100);
    for (const sibling of siblings) {
      if (sibling._id !== row._id && (!scopedKinds() || scopedKinds()!.includes(sibling.kind))) await ctx.db.patch(sibling._id, { status: "pending", leaseUntil: undefined, nextAttemptAt: Math.max(sibling.nextAttemptAt, until) });
    }
  }
  // Archive fences retries immediately, but cannot recall a provider request
  // already attempted. Preserve only matching-attempt successful completion.
  if (row.status === "cancelled" && row.attempts === args.attempt && args.success && row.firstAttemptAt !== undefined && row.providerPayload) {
    await ctx.db.patch(row._id, { status: "sent", sentAt: Date.now(), leaseUntil: undefined, error: "Provider accepted in-flight delivery after cancellation; no retry" });
    return null;
  }
  if (row.status !== "sending" || row.attempts !== args.attempt) return null;
  const retry = !args.success && args.retry && row.attempts < 6;
  await ctx.db.patch(row._id, { status: args.success ? "sent" : retry ? "pending" : "failed", sentAt: args.success ? Date.now() : undefined, error: args.success ? row.error : args.error, leaseUntil: undefined, nextAttemptAt: Date.now() + Math.max(args.retryAfterMs ?? 0, Math.min(3600000, 60000 * 2 ** row.attempts)) }); return null;
}});
// Last transactional check immediately before external I/O. Reset may still
// commit after this check; it cannot recall a request already in flight.
export const authorizeSend = internalMutation({ args: { id: v.id("femaleWorkflowDeliveries"), attempt: v.number() }, handler: async (ctx, args) => {
  const row = await ctx.db.get(args.id);
  if (!row || row.resetAuditId !== undefined || row.status !== "sending" || row.attempts !== args.attempt || !row.leaseUntil || row.leaseUntil <= Date.now() || !row.providerPayload) return false;
  if (!await deliveryAuthorized(ctx, row)) return false;
  try {
    const { workflow, sister, brother } = await (row.kind === "final_request" ? currentFinalRequest(ctx, row) : participants(ctx, row.interestId));
    const recipient = row.recipientId === sister._id ? sister : row.recipientId === brother._id ? brother : null;
    if (!recipient || row.providerPayload.to.length !== 1 || row.providerPayload.to[0] !== recipient.email) return false;
    if (row.kind === "brother_review" && (row.recipientId !== brother._id || workflow.state !== "awaiting_brother_review" || !("reviewTokenHash" in workflow) || !workflow.reviewTokenHash || !("reviewExpiresAt" in workflow) || !workflow.reviewExpiresAt || workflow.reviewExpiresAt <= Date.now())) return false;
    if (row.kind === "sister_confirmation") {
      const interest = await ctx.db.get(row.interestId);
      if (!interest || row.recipientId !== sister._id || workflow.state !== "awaiting_sister_confirmation" || !currentSisterConfirmation(interest, row) || (row.sisterRecipientEmail !== undefined && row.sisterRecipientEmail !== sister.email)) return false;
    }
    if (row.kind === "pending_review" && workflow.state !== "pending_admin_approval" && workflow.state !== "contacts_released") return false;
    if (row.kind === "contacts_ready" && workflow.state !== "contacts_released") return false;
  } catch { return false; }
  return true;
}});
export function deliveryConfig(email: string) {
  const allowed = (process.env.FEMALE_WORKFLOW_EMAIL_ALLOWED_RECIPIENTS ?? "").split(",").map(s => s.trim().toLowerCase());
  const portal = process.env.FEMALE_WORKFLOW_PORTAL_URL;
  const key = process.env.FEMALE_WORKFLOW_RESEND_API_KEY;
  const from = process.env.FEMALE_WORKFLOW_EMAIL_FROM;
  const mode = process.env.FEMALE_WORKFLOW_EMAIL_MODE;
  const production = (mode === FINAL_REQUEST_MODE || mode === "production" || mode === BROTHER_REVIEW_MODE || mode === SISTER_CONFIRMATION_MODE || mode === COMBINED_REVIEW_MODE) && process.env.FEMALE_WORKFLOW_PRODUCTION_APPROVED === "true";
  if ((!production && mode !== "isolated") || (!production && !allowed.includes(email.trim().toLowerCase())) || !portal || !key || !from) return null;
  try {
    const url = new URL(portal);
    const liveOrigin = ["https://1plus1match.com", "https://www.1plus1match.com"].includes(url.origin);
    if (url.protocol !== "https:" || url.username || url.password || (production ? !liveOrigin : url.hostname === "1plus1match.com" || url.hostname.endsWith(".1plus1match.com"))) return null;
    return { key, from, portal: url.origin + "/dashboard" };
  } catch { return null; }
}
export const drain = internalAction({ args: {}, handler: async ctx => {
  const rows: Array<Doc<"femaleWorkflowDeliveries"> & { email: string }> = await ctx.runMutation(internal.femaleWorkflowDelivery.claim, {});
  for (const row of rows) {
    const payload = await ctx.runMutation(internal.femaleWorkflowDelivery.markAttempt, { id: row._id, attempt: row.attempts });
    if (!payload) continue;
    const config = deliveryConfig(payload.to[0]);
    if (!config) continue; // Recheck isolation on every replay.
    if (!await ctx.runMutation(internal.femaleWorkflowDelivery.authorizeSend, { id: row._id, attempt: row.attempts })) continue;
    try {
      const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: "Bearer " + config.key, "Content-Type": "application/json", "Idempotency-Key": row.key }, body: JSON.stringify(payload) });
      const retryAfter = response.headers.get("retry-after");
      const retryAfterMs = retryAfter ? (/^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : Math.max(0, Date.parse(retryAfter) - Date.now())) : 0;
      await ctx.runMutation(internal.femaleWorkflowDelivery.finish, { id: row._id, attempt: row.attempts, success: response.ok, retry: response.status === 429 || response.status >= 500, rateLimited: response.status === 429, error: response.ok ? undefined : "Email provider HTTP " + response.status, retryAfterMs: Number.isFinite(retryAfterMs) ? retryAfterMs : 0 });
      if (response.status === 429) break;
    } catch { await ctx.runMutation(internal.femaleWorkflowDelivery.finish, { id: row._id, attempt: row.attempts, success: false, retry: true, error: "Email transport failed; safe idempotent retry pending" }); }
  }
  return null;
}});
