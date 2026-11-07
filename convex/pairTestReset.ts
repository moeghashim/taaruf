import { internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { v, type Infer } from "convex/values";

const scopeValidator = v.object({
  registrationIds: v.array(v.id("registrations")),
  interestIds: v.array(v.id("interests")),
  flowIds: v.array(v.id("interestFlows")),
  eventIds: v.array(v.id("interestFlowEvents")),
  matchIds: v.array(v.id("matches")),
  shareIds: v.array(v.id("profileShares")),
});
type Scope = Infer<typeof scopeValidator>;
// Collision-free current-value fingerprint, not a lossy hash. Contains private data:
// keep preflight output and invocation arguments in restricted operator storage.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ":" + canonical(v)).join(",") + "}";
  return JSON.stringify(value);
}
function exact(actual: string[], expected: string[]) {
  if (new Set(expected).size !== expected.length || canonical([...actual].sort()) !== canonical([...expected].sort())) throw new Error("Scoped references changed or foreign references supplied");
}
async function snapshot(ctx: QueryCtx, scope: Scope) {
  for (const [key, count] of Object.entries({ registrationIds: 2, interestIds: 4, flowIds: 4, shareIds: 4 })) {
    if (scope[key as keyof Scope].length !== count) throw new Error("Approved topology required");
  }
  if (scope.matchIds.length > 1 || scope.eventIds.length > 1000) throw new Error("Approved topology required");
  const pair = new Set(scope.registrationIds);
  if (pair.size !== 2) throw new Error("Distinct pair required");
  const isPair = (a: string, b: string) => a !== b && pair.has(a as Scope["registrationIds"][number]) && pair.has(b as Scope["registrationIds"][number]);
  // Bounded complete scans deliberately fail closed, including malformed foreign
  // references that pair-only indexes would miss. No silently truncated preflight.
  const bounded = async <T extends "interests" | "interestFlows" | "interestFlowEvents" | "matches" | "profileShares" | "registrations">(table: T) => {
    const rows = await ctx.db.query(table).take(10001);
    if (rows.length > 10000) throw new Error("Preflight scan limit exceeded; manual review required");
    return rows;
  };
  const allInterests = await bounded("interests");
  const interests = allInterests.filter(r => isPair(r.fromRegistrationId, r.toRegistrationId));
  exact(interests.map(r => r._id), scope.interestIds);
  const flows = (await bounded("interestFlows")).filter(r => scope.interestIds.includes(r.interestId) || isPair(r.fromRegistrationId, r.toRegistrationId));
  exact(flows.map(r => r._id), scope.flowIds);
  for (const flow of flows) {
    const interest = interests.find(i => i._id === flow.interestId);
    if (!interest || flow.fromRegistrationId !== interest.fromRegistrationId || flow.toRegistrationId !== interest.toRegistrationId) throw new Error("Foreign workflow reference");
  }
  for (const interest of interests) if (flows.filter(f => f.interestId === interest._id).length !== 1 || interest.source !== "platform_submission" || interest.testReset) throw new Error("Invalid interest topology");
  const events = (await bounded("interestFlowEvents")).filter(r => scope.interestIds.includes(r.interestId) || scope.flowIds.includes(r.interestFlowId));
  exact(events.map(r => r._id), scope.eventIds);
  for (const event of events) if (!flows.some(f => f._id === event.interestFlowId && f.interestId === event.interestId)) throw new Error("Foreign event reference");
  const matches = (await bounded("matches")).filter(r => isPair(r.maleRegistrationId, r.femaleRegistrationId) || (r.interestId && scope.interestIds.includes(r.interestId)));
  exact(matches.map(r => r._id), scope.matchIds);
  for (const match of matches) if (!isPair(match.maleRegistrationId, match.femaleRegistrationId) || (match.interestId && !scope.interestIds.includes(match.interestId))) throw new Error("Foreign match reference");
  if (allInterests.some(i => i.matchId && scope.matchIds.includes(i.matchId) && !scope.interestIds.includes(i._id))) throw new Error("Foreign interest references match");
  for (const interest of interests) if (interest.matchId && !scope.matchIds.includes(interest.matchId)) throw new Error("Foreign interest match");
  const shares = (await bounded("profileShares")).filter(r => isPair(r.ownerRegistrationId, r.recipientRegistrationId) || (r.interestId && scope.interestIds.includes(r.interestId)) || (r.matchId && scope.matchIds.includes(r.matchId)));
  exact(shares.map(r => r._id), scope.shareIds);
  for (const share of shares) if (!isPair(share.ownerRegistrationId, share.recipientRegistrationId) || (share.interestId && !scope.interestIds.includes(share.interestId)) || (share.matchId && !scope.matchIds.includes(share.matchId))) throw new Error("Foreign share reference");
  const allRegistrations = await bounded("registrations");
  const registrations = allRegistrations.filter(r => pair.has(r._id));
  exact(registrations.map(r => r._id), scope.registrationIds);
  if (allRegistrations.some(r => !pair.has(r._id) && r.activeMatchId && scope.matchIds.includes(r.activeMatchId))) throw new Error("Foreign active pointer");
  if (registrations.some(r => r.activeMatchId && !scope.matchIds.includes(r.activeMatchId))) throw new Error("Unrelated active pointer");
  const state = { registrations, interests, flows, events, matches, shares };
  return { state, fingerprint: canonical(state) };
}

export const preflight = internalQuery({
  args: { scope: scopeValidator },
  handler: async (ctx, { scope }) => snapshot(ctx, scope),
});

export const reset = internalMutation({
  args: { scope: scopeValidator, expectedFingerprint: v.string(), operationKey: v.string(), reason: v.string(), confirmTest: v.literal(true) },
  handler: async (ctx, args) => {
    if (args.operationKey.length < 10 || args.operationKey.length > 200 || args.reason.trim().length < 10 || args.reason.length > 500) throw new Error("Operation key and review reason required");
    const request = canonical(args);
    const prior = await ctx.db.query("pairTestResetAudits").withIndex("by_operationKey", q => q.eq("operationKey", args.operationKey)).unique();
    if (prior) {
      if (prior.request !== request) throw new Error("Operation key reused with different request");
      return { alreadyReset: true, auditId: prior._id };
    }
    const { state, fingerprint } = await snapshot(ctx, args.scope);
    if (fingerprint !== args.expectedFingerprint) throw new Error("Preflight drift: abort and review a fresh snapshot");
    const now = Date.now();
    // Internal-only audit table: no public reader/writer, no tokens exposed in event history.
    const auditId = await ctx.db.insert("pairTestResetAudits", { operationKey: args.operationKey, request, snapshot: fingerprint, createdAt: now });
    for (const interest of state.interests) await ctx.db.patch(interest._id, { testReset: { at: now, reason: args.reason, actor: "admin" }, status: "closed", adminStatus: "pending", updatedAt: now });
    for (const flow of state.flows) await ctx.db.patch(flow._id, {
      flowStatus: "closed", closedReason: "admin_pair_test_reset", recipientDecision: "pending",
      requesterFinalApproval: "pending", recipientFinalApproval: "pending", requesterFinalApprovalAt: undefined, recipientFinalApprovalAt: undefined,
      photoDecision: "pending", photoRequestedByRegistrationId: undefined, photoRequestedAt: undefined, photoDecisionAt: undefined,
      photosVisibleAt: undefined, bioVisibleAt: undefined, contactSharedAt: undefined, keepOpenExpiresAt: undefined,
      finalApprovalNotificationSentAt: undefined, finalApprovalNotificationError: undefined, updatedAt: now,
    });
    for (const match of state.matches) await ctx.db.patch(match._id, { status: "closed", closedReason: "admin_pair_test_reset", testResetAt: now, updatedAt: now });
    for (const share of state.shares) await ctx.db.patch(share._id, { status: "closed", revokedAt: now, includeImages: false, updatedAt: now });
    for (const registration of state.registrations) if (registration.activeMatchId && args.scope.matchIds.includes(registration.activeMatchId)) await ctx.db.patch(registration._id, { activeMatchId: undefined });
    // No queue promotion, global preferences, event/attendance edits or notifications.
    return { alreadyReset: false, auditId };
  },
});
