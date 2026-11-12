import { internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { v, type Infer } from "convex/values";
import { hash } from "fast-sha256";

const scope = {
  mode: v.optional(v.literal("closed_history")),
  interestId: v.id("interests"), eventId: v.id("events"),
  fromRegistrationId: v.id("registrations"), toRegistrationId: v.id("registrations"),
};
const scopeValidator = v.object(scope);
type Scope = Infer<typeof scopeValidator>;
// Collision-free current-value fingerprint. PRIVATE: includes profiles and share
// tokens. Keep preflight/invocation output in restricted operator storage only.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ":" + canonical(v)).join(",") + "}";
  return JSON.stringify(value);
}
function digest(value: unknown): string {
  return Array.from(hash(new TextEncoder().encode(canonical(value))), b => b.toString(16).padStart(2, "0")).join("");
}
async function snapshot(ctx: QueryCtx, args: Scope) {
  const pair = new Set([args.fromRegistrationId, args.toRegistrationId]);
  if (pair.size !== 2) throw new Error("Distinct pair required");
  const isPair = (a: string, b: string) => a !== b && [...pair].some(id => id === a) && [...pair].some(id => id === b);
  // Complete bounded scans also detect foreign backreferences missed by pair indexes.
  const bounded = async <T extends "interests" | "interestFlows" | "interestFlowEvents" | "matches" | "profileShares" | "registrations" | "pairTestResetAudits" | "eventRegistrations" | "eventAttendees" | "events">(table: T) => {
    const rows = await ctx.db.query(table).take(10001);
    if (rows.length > 10000) throw new Error("Preflight scan limit exceeded; manual review required");
    return rows;
  };
  const allInterests = await bounded("interests");
  const interests = allInterests.filter(i => isPair(i.fromRegistrationId, i.toRegistrationId));
  const target = interests.find(i => i._id === args.interestId);
  if (!target || target.eventId !== args.eventId || target.fromRegistrationId !== args.fromRegistrationId || target.toRegistrationId !== args.toRegistrationId) throw new Error("Exact target scope mismatch");
  const closedHistory = args.mode === "closed_history";
  if (closedHistory) {
    if (target.source !== "platform_submission" || target.testReset || target.status !== "closed" || target.adminStatus !== "declined" || target.visibility !== "admin_actionable" || target.matchId) throw new Error("Target must be closed pair-reset submission");
  } else if (target.source !== "platform_submission" || target.testReset || target.status !== "new" || target.visibility !== "internal_only" || (target.adminStatus !== undefined && target.adminStatus !== "pending") || target.matchId) throw new Error("Target must be untouched new private submission");
  for (const i of interests) if (i._id !== target._id && (!i.testReset || i.status !== "closed")) throw new Error("Live historical interest");
  const ids = new Set(interests.map(i => i._id));
  const allFlows = await bounded("interestFlows");
  const flows = allFlows.filter(f => ids.has(f.interestId) || isPair(f.fromRegistrationId, f.toRegistrationId));
  const flow = flows.filter(f => f.interestId === target._id);
  if (flow.length !== 1) throw new Error("Exactly one target workflow required");
  const targetFlow = flow[0];
  const orphanFlows = flows.filter(f => !ids.has(f.interestId));
  for (const f of flows) {
    const i = allInterests.find(i => i._id === f.interestId);
    if (!isPair(f.fromRegistrationId, f.toRegistrationId) || (i && (!ids.has(i._id) || f.fromRegistrationId !== i.fromRegistrationId || f.toRegistrationId !== i.toRegistrationId))) throw new Error("Foreign workflow reference");
    if (f.photoRequestedByRegistrationId && !pair.has(f.photoRequestedByRegistrationId)) throw new Error("Foreign photo requester");
    if (f._id === targetFlow._id) {
      if (closedHistory) {
        // Previous bio/contact knowledge is historical, not a current grant.
        // Require the exact pair-reset closure; do not admit other closed states.
        if (f.flowStatus !== "closed" || f.closedReason !== "admin_reset_pair" || f.photoDecision !== "pending" || f.photosVisibleAt !== undefined || f.contactSharedAt !== undefined || f.photoRequestedAt !== undefined || f.photoRequestedByRegistrationId !== undefined || f.photoDecisionAt !== undefined || f.keepOpenExpiresAt !== undefined) throw new Error("Target must have closed pair-reset workflow without current access");
      } else if (f.flowStatus !== "private_documented" || f.recipientDecision !== "pending" || f.requesterFinalApproval !== "pending" || f.recipientFinalApproval !== "pending" || f.photoDecision !== "pending" || f.photoRequestedAt !== undefined || f.photoRequestedByRegistrationId !== undefined || f.photoDecisionAt !== undefined || f.requesterFinalApprovalAt !== undefined || f.recipientFinalApprovalAt !== undefined || f.bioVisibleAt !== undefined || f.photosVisibleAt !== undefined || f.contactSharedAt !== undefined || f.keepOpenExpiresAt !== undefined || f.finalApprovalNotificationSentAt !== undefined) throw new Error("Target workflow action or disclosure history");
    } else {
      // Deleted-parent legacy bio timestamps are inert; preserve and fingerprint.
      if (!["closed", "declined"].includes(f.flowStatus) || f.contactSharedAt !== undefined || f.photosVisibleAt !== undefined || (i && f.bioVisibleAt !== undefined) || f.photoDecision === "approved" || (i && (f.requesterFinalApproval === "approved" || f.recipientFinalApproval === "approved"))) throw new Error("Live historical workflow");
    }
  }
  for (const i of interests) if (flows.filter(f => f.interestId === i._id).length !== 1) throw new Error("Missing or duplicate historical workflow");
  // Include deleted-parent IDs to catch cross-linked events, matches and shares.
  const relevantIds = new Set(flows.map(f => f.interestId));
  const flowIds = new Set(flows.map(f => f._id));
  const history = (await bounded("interestFlowEvents")).filter(e => relevantIds.has(e.interestId) || flowIds.has(e.interestFlowId));
  for (const e of history) {
    if (!flows.some(f => f._id === e.interestFlowId && f.interestId === e.interestId) || (e.actorRegistrationId && !pair.has(e.actorRegistrationId))) throw new Error("Foreign history reference");
    // Fresh private submission has only its documented creation event. Unknown
    // events fail closed rather than trying to enumerate every disclosure/action.
    const allowedEvents = closedHistory
      ? ["flow_created", "interest_number_submitted", "inbound_accepted", "final_approval_given", "contact_shared", "pair_reset"]
      : ["interest_number_submitted", "flow_created"];
    if (e.interestId === target._id && !allowedEvents.includes(e.eventType)) throw new Error("Target action history");
  }
  if (closedHistory && !history.some(e => e.interestId === target._id && e.eventType === "pair_reset")) throw new Error("Historical pair_reset required");
  const matches = (await bounded("matches")).filter(m => isPair(m.maleRegistrationId, m.femaleRegistrationId) || (m.interestId && relevantIds.has(m.interestId)) || interests.some(i => i.matchId === m._id));
  for (const m of matches) {
    if (!isPair(m.maleRegistrationId, m.femaleRegistrationId) || (m.interestId && (!ids.has(m.interestId) || m.interestId === target._id)) || m.status !== "closed" || m.testResetAt === undefined) throw new Error("Live or foreign match dependency");
    if (allInterests.some(i => i.matchId === m._id && !ids.has(i._id))) throw new Error("Foreign match backreference");
  }
  for (const i of interests) if (i.matchId && !matches.some(m => m._id === i.matchId)) throw new Error("Missing match reference");
  const matchIds = new Set(matches.map(m => m._id));
  const shares = (await bounded("profileShares")).filter(s => isPair(s.ownerRegistrationId, s.recipientRegistrationId) || (s.interestId && relevantIds.has(s.interestId)) || (s.matchId && matchIds.has(s.matchId)));
  for (const s of shares) if (!isPair(s.ownerRegistrationId, s.recipientRegistrationId) || (s.interestId && (!ids.has(s.interestId) || s.interestId === target._id)) || (s.matchId && !matchIds.has(s.matchId)) || s.status !== "closed" || s.revokedAt === undefined || s.includeImages) throw new Error("Target share or live/foreign share dependency");
  const allRegistrations = await bounded("registrations");
  const registrations = allRegistrations.filter(r => pair.has(r._id));
  if (registrations.length !== 2 || registrations.some(r => r.activeMatchId) || allRegistrations.some(r => r.activeMatchId && matchIds.has(r.activeMatchId))) throw new Error("Missing registration or active match pointer");
  const events = (await bounded("events")).filter(e => interests.some(i => i.eventId === e._id));
  if (interests.some(i => !events.some(e => e._id === i.eventId))) throw new Error("Missing event reference");
  // Fingerprint historical and canonical associations, including superseded rows.
  const eventRegistrations = (await bounded("eventRegistrations")).filter(r => pair.has(r.registrationId) || (r.mergedIntoRegistrationId !== undefined && pair.has(r.mergedIntoRegistrationId)));
  const attendees = (await bounded("eventAttendees")).filter(r => pair.has(r.registrationId));
  // Preserve every original audit in place, including opaque legacy payloads.
  // Hash the COMPLETE row instead of recursively copying its snapshots.
  // All audit edits/additions/removals still invalidate preflight.
  const audits = (await bounded("pairTestResetAudits")).map(audit => ({
    _id: audit._id, _creationTime: audit._creationTime,
    operationKey: audit.operationKey, createdAt: audit.createdAt,
    sha256: digest(audit),
  }));
  const state = { target, targetFlow, registrations, interests, flows, orphanFlows, history, matches, shares, events, eventRegistrations, attendees, audits };
  return { state, fingerprint: canonical(closedHistory ? { mode: args.mode, state } : state) };
}
export const preflight = internalQuery({ args: scopeValidator, handler: snapshot });
export const reset = internalMutation({
  args: { ...scope, expectedFingerprint: v.string(), operationKey: v.string(), reason: v.string(), confirmTest: v.literal(true) },
  handler: async (ctx, args) => {
    if (args.operationKey.trim().length < 10 || args.operationKey.length > 200 || args.reason.trim().length < 10 || args.reason.length > 500) throw new Error("Operation key and review reason required");
    const request = canonical({ helper: "singleInterestTestReset/v1", ...args });
    const prior = await ctx.db.query("pairTestResetAudits").withIndex("by_operationKey", q => q.eq("operationKey", args.operationKey)).unique();
    if (prior) {
      if (prior.request !== request) throw new Error("Operation key reused with different request");
      return { alreadyReset: true, auditId: prior._id };
    }
    const { state, fingerprint } = await snapshot(ctx, args);
    if (fingerprint !== args.expectedFingerprint) throw new Error("Preflight drift: review fresh snapshot");
    const now = Date.now();
    const auditId = await ctx.db.insert("pairTestResetAudits", { operationKey: args.operationKey, request, snapshot: fingerprint, createdAt: now });
    await ctx.db.patch(state.target._id, { testReset: { at: now, reason: args.reason, actor: "admin" }, status: "closed", adminStatus: "pending", updatedAt: now });
    await ctx.db.patch(state.targetFlow._id, {
      flowStatus: "closed", closedReason: "admin_test_reset", recipientDecision: "pending",
      requesterFinalApproval: "pending", recipientFinalApproval: "pending", requesterFinalApprovalAt: undefined, recipientFinalApprovalAt: undefined,
      photoDecision: "pending", photoRequestedByRegistrationId: undefined, photoRequestedAt: undefined, photoDecisionAt: undefined,
      photosVisibleAt: undefined, bioVisibleAt: undefined, contactSharedAt: undefined, keepOpenExpiresAt: undefined,
      finalApprovalNotificationSentAt: undefined, finalApprovalNotificationError: undefined, updatedAt: now,
    });
    await ctx.db.insert("interestFlowEvents", { interestFlowId: state.targetFlow._id, interestId: state.target._id, actor: "admin", eventType: "admin_test_reset", message: args.mode === "closed_history" ? `${args.reason} [closed_history: prior disclosure history retained; reset does not erase previously shared contact knowledge]` : args.reason, createdAt: now });
    // No old-record edits, queue promotion, email, profile, attendance or prefs writes.
    return { alreadyReset: false, auditId };
  },
});

const revokeScope = { ownerRegistrationId:v.id("registrations"), recipientRegistrationId:v.id("registrations"), shareIds:v.array(v.id("profileShares")) };
async function shareSnapshot(ctx:QueryCtx,args:{ownerRegistrationId:import("./_generated/dataModel").Id<"registrations">;recipientRegistrationId:import("./_generated/dataModel").Id<"registrations">;shareIds:import("./_generated/dataModel").Id<"profileShares">[]}) {
 if(args.ownerRegistrationId===args.recipientRegistrationId||args.shareIds.length!==2||new Set(args.shareIds).size!==2)throw new Error("Exact two distinct grants required");
 const registrations=await Promise.all([ctx.db.get(args.ownerRegistrationId),ctx.db.get(args.recipientRegistrationId)]);
 if(registrations.some(r=>!r))throw new Error("Missing participant");
 const shares=await Promise.all(args.shareIds.map(id=>ctx.db.get(id)));
 for(const s of shares)if(!s||s.ownerRegistrationId!==args.ownerRegistrationId||s.recipientRegistrationId!==args.recipientRegistrationId||s.interestId||s.matchId||s.revokedAt!==undefined||!["shared","viewed"].includes(s.status))throw new Error("Grant scope or state changed");
 const state={registrations,shares};return {state,fingerprint:canonical(state)};
}
export const preflightShares=internalQuery({args:revokeScope,handler:shareSnapshot});
export const revokeShares=internalMutation({args:{...revokeScope,expectedFingerprint:v.string(),operationKey:v.string(),reason:v.string(),confirmTest:v.literal(true)},handler:async(ctx,args)=>{
 if(args.operationKey.trim().length<10||args.operationKey.length>200||args.reason.trim().length<10||args.reason.length>500)throw new Error("Operation key and review reason required");
 const request=canonical({helper:"singleInterestTestReset/revokeShares/v1",...args});
 const prior=await ctx.db.query("pairTestResetAudits").withIndex("by_operationKey",q=>q.eq("operationKey",args.operationKey)).unique();
 if(prior){if(prior.request!==request)throw new Error("Operation key reused with different request");return {alreadyRevoked:true,auditId:prior._id};}
 const {state,fingerprint}=await shareSnapshot(ctx,args);if(fingerprint!==args.expectedFingerprint)throw new Error("Preflight drift: review fresh snapshot");
 const now=Date.now();const auditId=await ctx.db.insert("pairTestResetAudits",{operationKey:args.operationKey,request,snapshot:fingerprint,createdAt:now});
 for(const s of state.shares)await ctx.db.patch(s!._id,{status:"closed",revokedAt:now,includeImages:false,updatedAt:now});
 return {alreadyRevoked:false,auditId};
}});
