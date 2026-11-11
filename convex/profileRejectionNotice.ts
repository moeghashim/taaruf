import { v } from "convex/values";
import { internalMutation, internalAction, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";

export const SUBJECT = "Your 1 Plus 1 Application";
export const BODY = `Assalamu Alaikum,

Thank you for your interest in participating in 1 Plus 1.

After reviewing your registration, we regret to inform you that your application did not meet the eligibility requirements for participation in the 1 Plus 1 program. As a result, we are unable to approve your registration.

We appreciate your interest and understanding, and we wish you all the best in your journey.

Jazakum Allahu Khairan.

Regards,
The 1 Plus 1 Team.`;
const ACTIVATION = "profileRejectionNoticeActivatedAt";
function configured() {
  return process.env.PROFILE_REJECTION_NOTICE_APPROVED === "true" && !!process.env.PROFILE_REJECTION_NOTICE_RESEND_API_KEY && !!process.env.PROFILE_REJECTION_NOTICE_FROM;
}
// Explicit release operation AFTER preview approval; never invoked by deployment/cron.
export const activate = internalMutation({ args: {}, handler: async ctx => {
  if (!configured()) throw new Error("Dedicated approved rejection-notice configuration required");
  const existing = await ctx.db.query("settings").withIndex("by_key", q => q.eq("key", ACTIVATION)).unique();
  if (!existing) await ctx.db.insert("settings", { key: ACTIVATION, value: String(Date.now()) });
}});
// Called in the same transaction as the sole whole-profile status mutation.
// Explicit exception to the event-email prohibition: never use event email claims.
export async function transition(ctx: MutationCtx, previous: Doc<"registrations">, status: string) {
  if (previous.status === status) return;
  // Cancel even if approval is disabled: reversal must fence old work permanently.
  const existing = await ctx.db.query("profileRejectionNotices").withIndex("by_registrationId", q => q.eq("registrationId", previous._id)).unique();
  if (status !== "rejected") {
    if (existing && ["pending", "sending"].includes(existing.state)) await ctx.db.patch(existing._id, { state: existing.firstAttemptAt === undefined ? "cancelled" : "needs_reconciliation", updatedAt: Date.now(), detail: "Profile rejection reversed; any in-flight acceptance requires reconciliation" });
    return;
  }
  // At most one notice per profile lifetime, including re-rejection. No sweep/backfill.
  if (existing || !configured()) return;
  const activation = await ctx.db.query("settings").withIndex("by_key", q => q.eq("key", ACTIVATION)).unique();
  if (!activation || !Number.isSafeInteger(Number(activation.value)) || Number(activation.value) <= 0 || Number(activation.value) > Date.now()) return;
  await ctx.db.insert("profileRejectionNotices", { registrationId: previous._id, email: previous.email, state: "pending", attempts: 0, nextAttemptAt: Date.now(), createdAt: Date.now(), updatedAt: Date.now() });
}
export const claim = internalMutation({ args: {}, handler: async ctx => {
  if (!configured()) return null;
  const now = Date.now();
  const pending = await ctx.db.query("profileRejectionNotices").withIndex("by_state_and_nextAttemptAt", q => q.eq("state", "pending").lte("nextAttemptAt", now)).first();
  const abandoned = await ctx.db.query("profileRejectionNotices").withIndex("by_state_and_nextAttemptAt", q => q.eq("state", "sending").lte("nextAttemptAt", now)).first();
  const row = abandoned ?? pending;
  if (!row) return null;
  const profile = await ctx.db.get(row.registrationId);
  if (!profile || profile.status !== "rejected" || profile.email !== row.email) {
    await ctx.db.patch(row._id, { state: row.firstAttemptAt === undefined ? "cancelled" : "needs_reconciliation", updatedAt: now, detail: "Profile no longer rejected or recipient changed; reconcile any prior attempt" }); return null;
  }
  // Resend retains idempotency keys 24h. Stop conservatively at 23h, never create a new key.
  if (row.attempts >= 6 || (row.firstAttemptAt !== undefined && now - row.firstAttemptAt >= 23 * 3600000)) {
    await ctx.db.patch(row._id, { state: "needs_reconciliation", updatedAt: now, detail: "Retry budget/window exhausted; do not resend without provider reconciliation" }); return null;
  }
  const payload = row.payload ?? { from: process.env.PROFILE_REJECTION_NOTICE_FROM!, to: [row.email], subject: SUBJECT, text: BODY };
  await ctx.db.patch(row._id, { state: "sending", payload, firstAttemptAt: row.firstAttemptAt ?? now, attempts: row.attempts + 1, nextAttemptAt: now + 120000, updatedAt: now });
  return { id: row._id, attempt: row.attempts + 1, payload };
}});
export const finish = internalMutation({ args: { id: v.id("profileRejectionNotices"), attempt: v.number(), providerId: v.optional(v.string()), retryAfterMs: v.optional(v.number()), permanent: v.optional(v.boolean()) }, handler: async (ctx, args) => {
  const row = await ctx.db.get(args.id);
  if (!row || !row.payload || args.attempt < 1 || args.attempt > row.attempts) return;
  // Preserve evidence of late provider acceptance even after a reversal.
  if (args.providerId) { await ctx.db.patch(row._id, { state: "accepted", providerId: args.providerId, updatedAt: Date.now(), detail: ["cancelled", "needs_reconciliation"].includes(row.state) ? "Provider accepted in-flight notice after cancellation/reconciliation hold" : "Provider accepted; inbox delivery not confirmed" }); return; }
  if (row.state !== "sending" || row.attempts !== args.attempt) return;
  await ctx.db.patch(row._id, { state: args.permanent || row.attempts >= 6 ? "needs_reconciliation" : "pending", updatedAt: Date.now(), nextAttemptAt: Date.now() + Math.max(60000 * 2 ** row.attempts, args.retryAfterMs ?? 0), detail: "Provider acceptance unconfirmed; replay only with original idempotency key and frozen payload" });
}});
export const drain = internalAction({ args: {}, handler: async ctx => {
  const row = await ctx.runMutation(internal.profileRejectionNotice.claim, {});
  if (!row) return;
  try {
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: "Bearer " + process.env.PROFILE_REJECTION_NOTICE_RESEND_API_KEY, "Content-Type": "application/json", "Idempotency-Key": "profile-rejection-notice/" + row.id }, body: JSON.stringify(row.payload), signal: AbortSignal.timeout(30000) });
    const data = await response.json() as { id?: string };
    const retryAfter = response.headers.get("retry-after");
    const delay = retryAfter ? (/^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now()) : 0;
    await ctx.runMutation(internal.profileRejectionNotice.finish, { id: row.id, attempt: row.attempt, providerId: response.ok && typeof data.id === "string" && data.id ? data.id : undefined, permanent: !response.ok && response.status !== 429 && response.status < 500, retryAfterMs: Number.isFinite(delay) ? Math.max(0, delay) : 0 });
  } catch {
    await ctx.runMutation(internal.profileRejectionNotice.finish, { id: row.id, attempt: row.attempt });
  }
}});
