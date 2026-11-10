import { internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { hash } from "fast-sha256";
import type { Id, TableNames } from "./_generated/dataModel";

const scope = { applicant219: v.id("registrations"), applicant220: v.id("registrations") };
type Scope = { applicant219: Id<"registrations">; applicant220: Id<"registrations"> };
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ":" + canonical(v)).join(",") + "}";
  return JSON.stringify(value);
}
function digest(value: unknown) {
  return Array.from(hash(new TextEncoder().encode(canonical(value))), b => b.toString(16).padStart(2, "0")).join("");
}
// Deliberately restricted maintenance operation, not a general retention bypass.
async function snapshot(ctx: QueryCtx, args: Scope) {
  const a = await ctx.db.get(args.applicant219), b = await ctx.db.get(args.applicant220);
  if (!a || !b || a._id === b._id || a.publicApplicantNumber !== 219 || b.publicApplicantNumber !== 220) throw new Error("Exact permanent applicants 219 and 220 required");
  const pair = new Set<string>([a._id, b._id]);
  const isPair = (x: string, y: string) => x !== y && pair.has(x) && pair.has(y);
  let bytes = 0;
  const bounded = async <T extends TableNames>(table: T) => {
    const rows = await ctx.db.query(table).take(10001);
    if (rows.length > 10000) throw new Error("Scan limit exceeded");
    bytes += new TextEncoder().encode(canonical(rows)).length;
    if (bytes > 12_000_000) throw new Error("Snapshot byte limit exceeded");
    return rows;
  };
  const allInterests = await bounded("interests"), allFlows = await bounded("interestFlows"), allMatches = await bounded("matches"), allShares = await bounded("profileShares");
  const interests = allInterests.filter(i => isPair(i.fromRegistrationId, i.toRegistrationId));
  const flows = allFlows.filter(f => isPair(f.fromRegistrationId, f.toRegistrationId));
  const matches = allMatches.filter(m => isPair(m.maleRegistrationId, m.femaleRegistrationId));
  const shares = allShares.filter(s => isPair(s.ownerRegistrationId, s.recipientRegistrationId));
  // Historical parents are proven by pair-owned flows/matches/shares, not actor IDs.
  const interestIds = new Set<Id<"interests">>([...interests.map(i => i._id), ...flows.map(f => f.interestId), ...matches.flatMap(m => m.interestId ? [m.interestId] : []), ...shares.flatMap(s => s.interestId ? [s.interestId] : [])]);
  const flowIds = new Set(flows.map(f => f._id)), matchIds = new Set(matches.map(m => m._id));
  for (const i of allInterests) if ((interestIds.has(i._id) && !isPair(i.fromRegistrationId, i.toRegistrationId)) || (i.matchId && matchIds.has(i.matchId) && !interestIds.has(i._id))) throw new Error("Foreign interest reference");
  for (const i of interests) if (i.matchId && !matchIds.has(i.matchId)) throw new Error("Missing or foreign match");
  for (const f of allFlows) if (interestIds.has(f.interestId)) {
    const parent = allInterests.find(i => i._id === f.interestId);
    if (!flowIds.has(f._id) || (parent && (parent.fromRegistrationId !== f.fromRegistrationId || parent.toRegistrationId !== f.toRegistrationId)) || (f.photoRequestedByRegistrationId && !pair.has(f.photoRequestedByRegistrationId))) throw new Error("Foreign workflow reference");
  }
  for (const m of allMatches) if (m.interestId && interestIds.has(m.interestId) && !matchIds.has(m._id)) throw new Error("Foreign match reference");
  for (const s of allShares) {
    const owned = isPair(s.ownerRegistrationId, s.recipientRegistrationId);
    if ((owned && ((s.interestId && !interestIds.has(s.interestId)) || (s.matchId && !matchIds.has(s.matchId)))) || (!owned && ((s.interestId && interestIds.has(s.interestId)) || (s.matchId && matchIds.has(s.matchId))))) throw new Error("Foreign share reference");
  }
  const allHistory = await bounded("interestFlowEvents");
  const history = allHistory.filter(e => interestIds.has(e.interestId) || flowIds.has(e.interestFlowId));
  for (const e of history) if (!flows.some(f => f._id === e.interestFlowId && f.interestId === e.interestId) || (e.actorRegistrationId && !pair.has(e.actorRegistrationId))) throw new Error("Ambiguous workflow event");
  // Unowned dangling events cannot be attributed safely: require manual reconciliation.
  for (const e of allHistory) if (!allFlows.some(f => f._id === e.interestFlowId) && !allInterests.some(i => i._id === e.interestId)) throw new Error("Unattributed dangling event");
  const allDeliveries = await bounded("femaleWorkflowDeliveries");
  const deliveries = allDeliveries.filter(d => interestIds.has(d.interestId));
  for (const d of deliveries) {
    if (!pair.has(d.recipientId)) throw new Error("Foreign delivery recipient");
    // Even terminal status/expired leases cannot rule out older overlapping calls.
    // Previously attempted rows need separate reconciliation; never clear flags to pass.
    if (d.status === "sending" || d.leaseUntil !== undefined || d.firstAttemptAt !== undefined || d.attempts !== 0 || d.providerPayload !== undefined || (d.providerCooldownUntil ?? 0) > Date.now()) throw new Error("Delivery not reconciled/quiescent");
  }
  for (const d of allDeliveries) if (!interestIds.has(d.interestId) && !allInterests.some(i => i._id === d.interestId) && pair.has(d.recipientId)) throw new Error("Unattributed dangling delivery");
  const registrations = await bounded("registrations");
  if (registrations.some(r => r.activeMatchId && matchIds.has(r.activeMatchId))) throw new Error("Preserved registration has active match pointer");
  const audits = (await bounded("pairTestResetAudits")).map(r => ({ id: r._id, sha256: digest(r) }));
  const preserved = { registrations, eventRegistrations: await bounded("eventRegistrations"), eventAttendees: await bounded("eventAttendees"), events: await bounded("events"), audits };
  const rows = { interests, interestFlows: flows, interestFlowEvents: history, matches, profileShares: shares, femaleWorkflowDeliveries: deliveries };
  const manifest = Object.fromEntries(Object.entries(rows).map(([table, docs]) => [table, { count: docs.length, ids: docs.map(d => d._id).sort() }]));
  const total = Object.values(rows).reduce((sum, docs) => sum + docs.length, 0);
  if (total > 500) throw new Error("Deletion limit exceeded");
  const historicalInterestIds = [...interestIds].filter(id => !interests.some(i => i._id === id)).sort();
  const preservationDigest = digest(preserved);
  const fingerprint = digest({ version: 1, scope: { applicant219: args.applicant219, applicant220: args.applicant220 }, rows, preserved });
  return { rows, manifest, total, historicalInterestIds, audits, preservationDigest, fingerprint };
}
export const preflight = internalQuery({ args: scope, handler: async (ctx, args) => {
  const { rows: _rows, ...result } = await snapshot(ctx, args); void _rows; return result;
} });
export const execute = internalMutation({
  args: { ...scope, expectedFingerprint: v.string(), expectedManifest: v.string(), operationKey: v.string(), reason: v.string(), confirmAllPairHistory: v.literal(true) },
  handler: async (ctx, args) => {
    if (!/^[a-f0-9]{64}$/.test(args.expectedFingerprint) || args.expectedManifest.length > 100_000 || args.operationKey.trim().length < 10 || args.operationKey.length > 200 || args.reason.trim().length < 10 || args.reason.length > 500) throw new Error("Bounded reviewed request required");
    const request = canonical({ helper: "pairHistoryCleanup/219-220/v1", ...args });
    const prior = await ctx.db.query("pairTestResetAudits").withIndex("by_operationKey", q => q.eq("operationKey", args.operationKey)).unique();
    if (prior) {
      if (prior.request !== request) throw new Error("Operation key reused with different request");
      return { alreadyExecuted: true, auditId: prior._id };
    }
    const state = await snapshot(ctx, args);
    if (args.expectedFingerprint !== state.fingerprint || canonical(JSON.parse(args.expectedManifest)) !== canonical(state.manifest)) throw new Error("Preflight drift: review fresh manifest");
    if (!state.total) throw new Error("Pair already empty; use original operation for replay");
    const { rows, ...receipt } = state;
    const auditSnapshot = canonical(receipt);
    if (new TextEncoder().encode(request + auditSnapshot).length > 250_000) throw new Error("Audit size limit exceeded");
    const auditId = await ctx.db.insert("pairTestResetAudits", { operationKey: args.operationKey, request, snapshot: auditSnapshot, createdAt: Date.now() });
    for (const docs of Object.values(rows)) for (const row of docs) await ctx.db.delete(row._id);
    // No registration/profile writes, queues, notifications, storage or scheduler calls.
    return { alreadyExecuted: false, auditId };
  },
});
