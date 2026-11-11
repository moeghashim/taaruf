import { mutation, query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { hash } from "fast-sha256";
import { requireAdmin } from "./adminAuthorization";
import type { Id, TableNames } from "./_generated/dataModel";

// Permanent registration IDs, NOT a caller-selected pair or a public-number lookup.
export const TEST_PAIR = ["j57fqgmbmh3am42geabkq852zx8g5wxy", "j572w0f7mwazj4ke8snn0k99hn8g508t"] as const;
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ":" + canonical(v)).join(",") + "}";
  return JSON.stringify(value);
}
function digest(value: unknown) { return Array.from(hash(new TextEncoder().encode(canonical(value))), b => b.toString(16).padStart(2, "0")).join(""); }
async function snapshot(ctx: QueryCtx) {
  const pair = new Set<string>(TEST_PAIR);
  const isPair = (a: string, b: string) => a !== b && pair.has(a) && pair.has(b);
  let bytes = 0;
  const bounded = async <T extends TableNames>(table: T) => {
    const rows = await ctx.db.query(table).take(10001);
    bytes += new TextEncoder().encode(canonical(rows)).length;
    if (rows.length > 10000 || bytes > 12_000_000) throw new Error("Reset scan limit exceeded; manual review required");
    return rows;
  };
  const registrations = await bounded("registrations");
  for (const [index, id] of TEST_PAIR.entries()) if (registrations.find(r => r._id === id)?.publicApplicantNumber !== 219 + index) throw new Error("Configured test pair unavailable");
  const allInterests = await bounded("interests"), allFlows = await bounded("interestFlows"), allMatches = await bounded("matches"), allShares = await bounded("profileShares");
  const interests = allInterests.filter(i => isPair(i.fromRegistrationId, i.toRegistrationId));
  const flows = allFlows.filter(f => isPair(f.fromRegistrationId, f.toRegistrationId));
  const matches = allMatches.filter(m => isPair(m.maleRegistrationId, m.femaleRegistrationId));
  const shares = allShares.filter(s => isPair(s.ownerRegistrationId, s.recipientRegistrationId));
  const ids = new Set<Id<"interests">>([...interests.map(i => i._id), ...flows.map(f => f.interestId)]);
  const matchIds = new Set(matches.map(m => m._id));
  const flowIds = new Set(flows.map(f => f._id));
  for (const i of allInterests) if ((ids.has(i._id) && !isPair(i.fromRegistrationId, i.toRegistrationId)) || (i.matchId && matchIds.has(i.matchId) && !ids.has(i._id))) throw new Error("Foreign interest reference");
  for (const i of interests) if (i.source !== "platform_submission" || (i.matchId && !matchIds.has(i.matchId)) || flows.filter(f => f.interestId === i._id).length !== 1) throw new Error("Unexpected pair topology; manual review required");
  for (const f of allFlows) if (ids.has(f.interestId)) {
    const i = interests.find(i => i._id === f.interestId);
    if (!flowIds.has(f._id) || (i && (i.fromRegistrationId !== f.fromRegistrationId || i.toRegistrationId !== f.toRegistrationId)) || (f.photoRequestedByRegistrationId && !pair.has(f.photoRequestedByRegistrationId))) throw new Error("Foreign workflow reference");
  }
  for (const m of allMatches) if ((m.interestId && ids.has(m.interestId) && !matchIds.has(m._id)) || (matchIds.has(m._id) && m.interestId && !ids.has(m.interestId))) throw new Error("Foreign match reference");
  for (const s of allShares) {
    const owned = isPair(s.ownerRegistrationId, s.recipientRegistrationId);
    if ((owned && ((s.interestId && !ids.has(s.interestId)) || (s.matchId && !matchIds.has(s.matchId)))) || (!owned && ((s.interestId && ids.has(s.interestId)) || (s.matchId && matchIds.has(s.matchId))))) throw new Error("Foreign share reference");
  }
  if (registrations.some(r => !pair.has(r._id) && r.activeMatchId && matchIds.has(r.activeMatchId))) throw new Error("Foreign active match pointer");
  const history = (await bounded("interestFlowEvents")).filter(e => ids.has(e.interestId) || flowIds.has(e.interestFlowId));
  for (const e of history) if (!flows.some(f => f._id === e.interestFlowId && f.interestId === e.interestId) || (e.actorRegistrationId && !pair.has(e.actorRegistrationId))) throw new Error("Foreign history reference");
  const deliveries = (await bounded("femaleWorkflowDeliveries")).filter(d => ids.has(d.interestId));
  for (const d of deliveries) {
    if (!pair.has(d.recipientId)) throw new Error("Foreign delivery recipient");
  }
  // Same complete-row digest approach as repaired singleInterestTestReset: never
  // recursively embed prior snapshots; preserve every original audit untouched.
  const audits = (await bounded("pairTestResetAudits")).map(a => ({ id: a._id, sha256: digest(a) }));
  const state = { registrations: registrations.filter(r => pair.has(r._id)), interests, flows, matches, shares, history, deliveries, audits };
  const activeInterests = interests.filter(i => !i.testReset);
  const activeFlows = flows.filter(f => !["closed", "declined"].includes(f.flowStatus) || f.bioVisibleAt !== undefined || f.photosVisibleAt !== undefined || f.contactSharedAt !== undefined || f.photoDecision === "approved");
  const activeMatches = matches.filter(m => m.status !== "closed" || m.testResetAt === undefined);
  const activeShares = shares.filter(s => s.status !== "closed" || s.revokedAt === undefined || s.includeImages);
  // The audit ID is an irreversible retirement epoch. New submissions get new
  // interest/job IDs; no retired job can ever enter a later cycle.
  const pending = deliveries.filter(d => d.resetAuditId === undefined);
  const warnings = deliveries.some(d => d.sentAt !== undefined || d.status === "sent" || d.status === "sending" || d.firstAttemptAt !== undefined || d.providerPayload !== undefined || d.leaseUntil !== undefined)
    ? ["Previously sent or in-flight email cannot be recalled and may arrive after reset. Old delivery evidence is retained; retired links cannot restore access."] : [];
  const pointers = registrations.filter(r => pair.has(r._id) && r.activeMatchId && matchIds.has(r.activeMatchId));
  const count = activeInterests.length + activeFlows.length + activeMatches.length + activeShares.length + pending.length + pointers.length;
  if (count > 500) throw new Error("Reset write limit exceeded; manual review required");
  return { state, fingerprint: digest(state), activeInterests, activeFlows, activeMatches, activeShares, pending, pointers, count, warnings };
}
export const preview = query({ args: { adminSecret: v.string() }, handler: async (ctx, args) => {
  requireAdmin(args.adminSecret);
  const s = await snapshot(ctx);
  return { fingerprint: s.fingerprint, count: s.count, submissions: s.activeInterests.length, shares: s.activeShares.length, deliveries: s.pending.length, warnings: s.warnings };
}});
export const reset = mutation({ args: { adminSecret: v.string(), expectedFingerprint: v.string(), operationKey: v.string(), reason: v.string(), confirmPair: v.literal("219-220") }, handler: async (ctx, args) => {
  requireAdmin(args.adminSecret);
  if (!/^[a-f0-9]{64}$/.test(args.expectedFingerprint) || args.operationKey.length < 10 || args.operationKey.length > 100 || args.reason.trim().length < 10 || args.reason.length > 500) throw new Error("Confirmation and reason required");
  const { adminSecret: _secret, ...safeArgs } = args; void _secret;
  const request = canonical({ helper: "adminPairTestReset/v1", ...safeArgs });
  const prior = await ctx.db.query("pairTestResetAudits").withIndex("by_operationKey", q => q.eq("operationKey", args.operationKey)).unique();
  if (prior) { if (prior.request !== request) throw new Error("Operation key reused with different request"); return { alreadyReset: true, auditId: prior._id, warnings: ["Previously sent or in-flight email cannot be recalled. Retired delivery evidence is preserved."] }; }
  const s = await snapshot(ctx);
  if (s.fingerprint !== args.expectedFingerprint) throw new Error("Preview changed; review a fresh preview");
  if (!s.count) return { alreadyReset: true, auditId: null };
  const saved = canonical(s.state);
  if (new TextEncoder().encode(saved).length > 700_000) throw new Error("Audit size limit exceeded; manual review required");
  const now = Date.now();
  const auditId = await ctx.db.insert("pairTestResetAudits", { operationKey: args.operationKey, request, snapshot: saved, createdAt: now });
  for (const i of s.activeInterests) await ctx.db.patch(i._id, { testReset: { at: now, reason: args.reason, actor: "admin" }, status: "closed", adminStatus: "pending", ...(i.femaleWorkflow ? { femaleWorkflow: { ...i.femaleWorkflow, state: "revoked" as const, reviewTokenHash: undefined, reviewExpiresAt: undefined } } : {}), updatedAt: now });
  // Also close the fresh target's private workflow, even when no access was granted.
  const flowIds = new Set([...s.activeFlows.map(f => f._id), ...s.state.flows.filter(f => s.activeInterests.some(i => i._id === f.interestId)).map(f => f._id)]);
  for (const id of flowIds) {
    const f = s.state.flows.find(f => f._id === id)!;
    await ctx.db.patch(id, { flowStatus: "closed", closedReason: "admin_pair_test_reset", recipientDecision: "pending", requesterFinalApproval: "pending", recipientFinalApproval: "pending", requesterFinalApprovalAt: undefined, recipientFinalApprovalAt: undefined, photoDecision: "pending", photoRequestedByRegistrationId: undefined, photoRequestedAt: undefined, photoDecisionAt: undefined, photosVisibleAt: undefined, bioVisibleAt: undefined, contactSharedAt: undefined, keepOpenExpiresAt: undefined, finalApprovalNotificationSentAt: undefined, finalApprovalNotificationError: undefined, updatedAt: now });
    await ctx.db.insert("interestFlowEvents", { interestFlowId: id, interestId: f.interestId, actor: "admin", eventType: "admin_test_reset", message: args.reason, createdAt: now });
  }
  for (const m of s.activeMatches) await ctx.db.patch(m._id, { status: "closed", closedReason: "admin_pair_test_reset", testResetAt: now, updatedAt: now });
  for (const share of s.activeShares) await ctx.db.patch(share._id, { status: "closed", revokedAt: now, includeImages: false, updatedAt: now });
  for (const d of s.pending) await ctx.db.patch(d._id, { resetAuditId: auditId, resetAt: now, ...(["pending", "sending", "failed"].includes(d.status) ? { status: "cancelled" as const } : {}) });
  for (const r of s.pointers) await ctx.db.patch(r._id, { activeMatchId: undefined });
  return { alreadyReset: false, auditId, warnings: s.warnings };
}});
