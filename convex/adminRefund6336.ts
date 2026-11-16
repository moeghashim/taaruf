import { internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { hash } from "fast-sha256";
import { requireAdmin } from "./adminAuthorization";

// One authorized real closed submission. No participant identity or test designation.
import { exactScope6336 } from "./adminRefund6336Scope";
const scope = { interestId: v.id("interests"), eventId: v.id("events"), fromRegistrationId: v.id("registrations"), toRegistrationId: v.id("registrations") };
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.entries(value).filter(([, x]) => x !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => JSON.stringify(k) + ":" + canonical(x)).join(",") + "}";
  return JSON.stringify(value);
}
function digest(value: unknown) { return Array.from(hash(new TextEncoder().encode(canonical(value))), b => b.toString(16).padStart(2, "0")).join(""); }
function assertScope(args: Record<keyof typeof exactScope6336, string>) {
  for (const key of Object.keys(exactScope6336) as (keyof typeof exactScope6336)[]) if (args[key] !== exactScope6336[key]) throw Error("Exact authorized scope required");
}
async function snapshot(ctx: QueryCtx) {
  // Bounded complete dependency scan fails closed, never silently truncates.
  const bounded = async <T extends "interests" | "interestFlows" | "interestFlowEvents" | "matches" | "profileShares" | "femaleWorkflowDeliveries">(table: T) => {
    const rows = await ctx.db.query(table).take(10001);
    if (rows.length > 10000) throw Error("Review scan limit exceeded");
    return rows;
  };
  const interests = await bounded("interests"), target = interests.find(i => i._id === exactScope6336.interestId);
  if (!target || target.eventId !== exactScope6336.eventId || target.fromRegistrationId !== exactScope6336.fromRegistrationId || target.toRegistrationId !== exactScope6336.toRegistrationId) throw Error("Target identity changed");
  if (target.status !== "closed" || target.source !== "platform_submission" || target.testReset !== undefined || target.adminRemovedAt !== undefined || target.slotReturnedAt !== undefined || target.matchId || target.canonicalInterestId || target.femaleWorkflow || target.adminStatus !== "pending" || target.visibility !== "admin_actionable") throw Error("Expected closed charged state changed");
  if (interests.some(i => i.canonicalInterestId === target._id)) throw Error("Canonical dependency exists");
  const from = await ctx.db.get(target.fromRegistrationId), to = await ctx.db.get(target.toRegistrationId), event = await ctx.db.get(target.eventId);
  if (from?.publicApplicantNumber !== 267 || to?.publicApplicantNumber !== 257 || event?.eventCode !== "nov26") throw Error("Public identity or event changed");
  const flows = (await bounded("interestFlows")).filter(f => f.interestId === target._id);
  if (flows.length !== 1) throw Error("Exactly one workflow required");
  const flow = flows[0];
  if (flow.fromRegistrationId !== from._id || flow.toRegistrationId !== to._id || flow.flowStatus !== "awaiting_inbound_response" || flow.contactSharedAt !== undefined || flow.photosVisibleAt !== undefined || flow.closedReason !== undefined) throw Error("Expected workflow changed");
  if ((await bounded("matches")).some(m => m.interestId === target._id) || (await bounded("profileShares")).some(s => s.interestId === target._id)) throw Error("Linked access dependency exists");
  const deliveries = (await bounded("femaleWorkflowDeliveries")).filter(d => d.interestId === target._id);
  if (deliveries.some(d => !["sent", "cancelled"].includes(d.status))) throw Error("Outstanding delivery dependency exists");
  const history = (await bounded("interestFlowEvents")).filter(e => e.interestId === target._id || e.interestFlowId === flow._id);
  if (history.some(e => e.interestId !== target._id || e.interestFlowId !== flow._id)) throw Error("Foreign history reference");
  const charged = (id: typeof from._id) => interests.filter(i => i.fromRegistrationId === id && i.eventId === event._id && i.source === "platform_submission" && i.testReset === undefined && i.slotReturnedAt === undefined);
  const senderCharged = charged(from._id), recipientCharged = charged(to._id);
  if (senderCharged.length !== 3 || recipientCharged.length !== 0) throw Error("Expected 3/0 charged quotas changed");
  return { target, flow, history, deliveries, from, to, event, senderCharged, recipientCharged };
}
const auth = { adminSecret: v.optional(v.string()) };
export const preview = internalQuery({ args: { ...scope, ...auth }, handler: async (ctx, args) => {
  requireAdmin(args.adminSecret); assertScope(args);
  const s = await snapshot(ctx);
  return { fingerprint: digest(s), senderUsed: 3, senderAvailable: 0, recipientUsed: 0, recipientAvailable: 3 };
} });
export const removeAndRefund = internalMutation({ args: { ...scope, ...auth, expectedFingerprint: v.string(), confirm: v.literal("ADMIN REMOVE CLOSED 267 TO 257; RETURN ONE SLOT") }, handler: async (ctx, args) => {
  requireAdmin(args.adminSecret); assertScope(args);
  const operationKey = "admin-closed-interest-refund6336/v1/" + args.interestId;
  // Never retain the reusable admin credential in audit material.
  const { adminSecret: _secret, ...requestArgs } = args;
  void _secret;
  const request = canonical(requestArgs);
  const prior = await ctx.db.query("adminPairRemovalAudits").withIndex("by_operationKey", q => q.eq("operationKey", operationKey)).unique();
  if (prior) {
    if (prior.request !== request) throw Error("Operation already completed with different request");
    return { alreadyRemoved: true, auditId: prior._id, slotsReturned: 0 };
  }
  const s = await snapshot(ctx);
  if (digest(s) !== args.expectedFingerprint) throw Error("Stale expected-state fingerprint");
  const saved = canonical(s), now = Date.now();
  if (new TextEncoder().encode(saved).length > 700000) throw Error("Audit snapshot too large");
  const auditId = await ctx.db.insert("adminPairRemovalAudits", { operationKey, request, snapshot: saved, createdAt: now });
  await ctx.db.patch(s.target._id, { adminRemovedAt: now, slotReturnedAt: now, updatedAt: now });
  await ctx.db.patch(s.flow._id, { flowStatus: "closed", closedReason: "admin_removed_refunded", keepOpenExpiresAt: undefined, updatedAt: now });
  await ctx.db.insert("interestFlowEvents", { interestFlowId: s.flow._id, interestId: s.target._id, actor: "admin", eventType: "admin_removed_refunded", message: "Administrative removal of closed interest; one submission slot returned. Not a participant decision or test reset.", createdAt: now });
  return { alreadyRemoved: false, auditId, slotsReturned: 1 };
} });
