import { requireAdmin } from "./adminAuthorization";
import { v } from "convex/values";
import { internalMutation, internalAction, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";

export const SUBJECT = "Your 1 Plus 1 application has been approved";
export const BODY = `Assalamu alaikum,

Your application has been approved, and you are now part of our pool of approved applicants. Thank you for trusting 1 Plus 1 to be part of your journey.

If you have opted into background matching in your portal, please keep an eye on your email for potential interests. You can opt in or out at any time by logging in and updating your preference:
https://taaruf.vercel.app

Join our WhatsApp community for updates and upcoming opportunities:
https://chat.whatsapp.com/BBlrH8mAJtd4nyeTviHMiX

If you have any questions or need support, please don’t hesitate to reach out—we’re happy to help.

May Allah bring you what is best and place barakah in your search.

The 1 Plus 1 Team`;
export const GRACE_MS = 0;
// Reuse the transactional Resend transport; this workflow is independently gated.
// Keep the established transactional sender identical to src/lib/email.ts.
const TRANSACTIONAL_FROM = "1Plus1 Match <contact@1plus1match.com>";
function transport() {
  return {
    apiKey: process.env.APPROVAL_WELCOME_NOTICE_RESEND_API_KEY || process.env.RESEND_API_KEY,
    from: TRANSACTIONAL_FROM,
  };
}
const ACTIVATION = "approvalWelcomeNoticeActivatedAt";
function configured() {
  return process.env.APPROVAL_WELCOME_NOTICE_APPROVED === "true"
    && process.env.APPROVAL_WELCOME_NOTICE_DELIVERY === "live"
    && process.env.CONVEX_CLOUD_URL === "https://clever-meerkat-940.eu-west-1.convex.cloud"
    && !!transport().apiKey;
}
// Explicit release operation AFTER preview approval; never invoked by deployment/cron.
export const activate = internalMutation({ args: {}, handler: async ctx => {
  if (!configured()) throw new Error("Approved approval-notice configuration and transactional Resend credential required");
  const existing = await ctx.db.query("settings").withIndex("by_key", q => q.eq("key", ACTIVATION)).unique();
  if (!existing) await ctx.db.insert("settings", { key: ACTIVATION, value: String(Date.now()) });
}});
// Called in the same transaction as the sole whole-profile status mutation.
// Explicit exception to the event-email prohibition: never use event email claims.
export async function transition(ctx: MutationCtx, previous: Doc<"registrations">, status: string) {
  if (previous.archivedAt !== undefined || previous.securityRetiredAt !== undefined || previous.status === status) return;
  // Cancel even if approval is disabled: reversal must fence old work permanently.
  const existing = await ctx.db.query("approvalWelcomeNotices").withIndex("by_registrationId", q => q.eq("registrationId", previous._id)).unique();
  if (status !== "approved") {
    if (existing && ["pending", "sending"].includes(existing.state)) await ctx.db.patch(existing._id, { state: existing.firstAttemptAt === undefined ? "cancelled" : "needs_reconciliation", updatedAt: Date.now(), detail: "Profile approval reversed; any in-flight acceptance requires reconciliation" });
    return;
  }
  // One lifetime notice, even if cancelled; reapproval never resets delivery.
  if (existing || !configured()) return;
  const activation = await ctx.db.query("settings").withIndex("by_key", q => q.eq("key", ACTIVATION)).unique();
  if (!activation || !Number.isSafeInteger(Number(activation.value)) || Number(activation.value) <= 0 || Number(activation.value) > Date.now()) return;
  const now = Date.now();
  const notice = { registrationId: previous._id, email: previous.email, state: "pending" as const, attempts: 0, notBefore: now + GRACE_MS, nextAttemptAt: now + GRACE_MS, createdAt: now, updatedAt: now, detail: "Pending approval welcome" };
  await ctx.db.insert("approvalWelcomeNotices", notice);
}
export const claim = internalMutation({ args: {}, handler: async ctx => {
  if (!configured()) return null;
  const now = Date.now();
  const activation = await ctx.db.query("settings").withIndex("by_key", q => q.eq("key", ACTIVATION)).unique();
  const cutoff = Number(activation?.value);
  if (!Number.isSafeInteger(cutoff) || cutoff <= 0 || cutoff > now) return null;
  const pending = await ctx.db.query("approvalWelcomeNotices").withIndex("by_state_and_nextAttemptAt", q => q.eq("state", "pending").lte("nextAttemptAt", now)).first();
  const abandoned = await ctx.db.query("approvalWelcomeNotices").withIndex("by_state_and_nextAttemptAt", q => q.eq("state", "sending").lte("nextAttemptAt", now)).first();
  const row = abandoned ?? pending;
  if (!row) return null;
  // Fail closed for historical work, including abandoned attempts with a grace field.
  if (!Number.isSafeInteger(row.createdAt) || row.createdAt < cutoff) {
    await ctx.db.patch(row._id, { state: row.firstAttemptAt === undefined && row.attempts === 0 ? "cancelled" : "needs_reconciliation", updatedAt: now, detail: "Notice predates immutable activation boundary; no retroactive delivery" });
    return null;
  }
  // Cron carries no row snapshot: stale invocations read the current durable deadline.
  // No retroactive delivery for legacy unattempted rows without a grace boundary.
  if (row.firstAttemptAt === undefined && row.notBefore === undefined) {
    await ctx.db.patch(row._id, { state: "cancelled", updatedAt: now, detail: "Legacy notice without grace boundary; no retroactive delivery" }); return null;
  }
  if (row.notBefore !== undefined && now < row.notBefore) return null;
  const profile = await ctx.db.get(row.registrationId);
  if (!profile || profile.archivedAt !== undefined || profile.securityRetiredAt !== undefined || profile.approvalWelcomeSuppressedAt !== undefined || (profile.lastRestoredArchivedAt !== undefined && profile.lastRestoredArchivedAt >= row.createdAt) || profile.status !== "approved" || profile.email !== row.email) {
    await ctx.db.patch(row._id, { state: row.firstAttemptAt === undefined ? "cancelled" : "needs_reconciliation", updatedAt: now, detail: "Profile no longer approved or recipient changed; reconcile any prior attempt" }); return null;
  }
  // Resend retains idempotency keys 24h. Stop conservatively at 23h, never create a new key.
  if (row.attempts >= 6 || (row.firstAttemptAt !== undefined && now - row.firstAttemptAt >= 23 * 3600000)) {
    await ctx.db.patch(row._id, { state: "needs_reconciliation", updatedAt: now, detail: "Retry budget/window exhausted; do not resend without provider reconciliation" }); return null;
  }
  const payload = row.payload ?? { from: transport().from, to: [row.email], subject: SUBJECT, text: BODY, reply_to: "1plus1@plus1htx.org" };
  await ctx.db.patch(row._id, { state: "sending", payload, firstAttemptAt: row.firstAttemptAt ?? now, attempts: row.attempts + 1, nextAttemptAt: now + 120000, updatedAt: now });
  return { id: row._id, attempt: row.attempts + 1, payload };
}});
export const finish = internalMutation({ args: { id: v.id("approvalWelcomeNotices"), attempt: v.number(), providerId: v.optional(v.string()), retryAfterMs: v.optional(v.number()), permanent: v.optional(v.boolean()) }, handler: async (ctx, args) => {
  const row = await ctx.db.get(args.id);
  if (!row || !row.payload || args.attempt < 1 || args.attempt > row.attempts) return;
  // Preserve evidence of late provider acceptance even after a reversal.
  if (args.providerId) { await ctx.db.patch(row._id, { state: "accepted", providerId: args.providerId, updatedAt: Date.now(), detail: ["cancelled", "needs_reconciliation"].includes(row.state) ? "Provider accepted in-flight notice after cancellation/reconciliation hold" : "Provider accepted; inbox delivery not confirmed" }); return; }
  if (row.state !== "sending" || row.attempts !== args.attempt) return;
  await ctx.db.patch(row._id, { state: args.permanent || row.attempts >= 6 ? "needs_reconciliation" : "pending", updatedAt: Date.now(), nextAttemptAt: Date.now() + Math.max(60000 * 2 ** row.attempts, args.retryAfterMs ?? 0), detail: "Provider acceptance unconfirmed; replay only with original idempotency key and frozen payload" });
}});
export const drain = internalAction({ args: {}, handler: async ctx => {
  const row = await ctx.runMutation(internal.approvalWelcomeNotice.claim, {});
  if (!row) return;
  try {
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: "Bearer " + transport().apiKey, "Content-Type": "application/json", "Idempotency-Key": "approval-welcome-notice/" + row.id }, body: JSON.stringify(row.payload), signal: AbortSignal.timeout(30000) });
    // Gateways can return HTML/text errors; preserve Retry-After even then.
    const data = await response.json().catch(() => ({})) as { id?: string };
    const retryAfter = response.headers.get("retry-after");
    const delay = retryAfter ? (/^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now()) : 0;
    await ctx.runMutation(internal.approvalWelcomeNotice.finish, { id: row.id, attempt: row.attempt, providerId: response.ok && typeof data.id === "string" && data.id ? data.id : undefined, permanent: !response.ok && response.status !== 429 && response.status < 500, retryAfterMs: Number.isFinite(delay) ? Math.max(0, delay) : 0 });
  } catch {
    await ctx.runMutation(internal.approvalWelcomeNotice.finish, { id: row.id, attempt: row.attempt });
  }
}});

export const status = query({
  args: { adminSecret: v.optional(v.string()), registrationId: v.id("registrations") },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    const row = await ctx.db.query("approvalWelcomeNotices").withIndex("by_registrationId", q => q.eq("registrationId", args.registrationId)).unique();
    return row ? { state: row.state, notBefore: row.notBefore ?? null, attempted: row.firstAttemptAt !== undefined || row.attempts > 0 } : null;
  },
});

// Authorized6669: preserve audited manual acceptance without resending or changing preferences.
export const reconcileManualCatchup6669 = internalMutation({ args: {}, handler: async ctx => {
  const numbers = [343,345,347,348,349,350,351,352,353,354,355,357,359];
  const profiles = await ctx.db.query("registrations").collect();
  const targets = numbers.map(number => {
    const found = profiles.filter(p => p.publicApplicantNumber === number);
    if (found.length !== 1 || found[0].status !== "approved" || found[0].archivedAt !== undefined || found[0].securityRetiredAt !== undefined) throw new Error("Manual welcome reconciliation identity/status changed");
    return found[0];
  });
  let inserted = 0;
  for (const person of targets) {
    const existing = await ctx.db.query("approvalWelcomeNotices").withIndex("by_registrationId", q => q.eq("registrationId", person._id)).unique();
    const detail = "Manual welcome accepted; authority6669; receipt " + ([343,345,347].includes(person.publicApplicantNumber!) ? "approval-welcome-catchup6632.json" : "approval-welcome-catchup6642.json") + "; lifetime automatic welcome suppressed";
    if (existing) { if (existing.state !== "cancelled" || existing.detail !== detail) throw new Error("Existing notice requires reconciliation"); continue; }
    const now = Date.now();
    await ctx.db.insert("approvalWelcomeNotices", {registrationId:person._id,email:person.email,state:"cancelled",attempts:0,notBefore:now,nextAttemptAt:now,createdAt:now,updatedAt:now,detail});
    inserted++;
  }
  return {inserted, total:targets.length};
}});
