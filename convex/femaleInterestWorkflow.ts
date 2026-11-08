import { sessionAllowed } from "./capabilitySecurity";
import { enqueueContactDelivery, deliveryParticipants } from "./contactGate";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAdmin } from "./adminAuthorization";
import { demoteOpenInterestsInvolvingRegistration } from "./interestRules";

type ReadCtx = QueryCtx | MutationCtx;
const interestArgs = { interestId: v.id("interests") };
const applicantArgs = { ...interestArgs, sessionHash: v.string() };
const reviewArgs = { ...applicantArgs, reviewTokenHash: v.optional(v.string()) };
const adminArgs = { ...interestArgs, adminSecret: v.optional(v.string()) };
export async function actor(ctx: ReadCtx, sessionHash: string) {
  const session = await ctx.db.query("applicantSessions").withIndex("by_sessionHash", q => q.eq("sessionHash", sessionHash)).unique();
  if (!session || !(await sessionAllowed(ctx, session))) throw new Error("Unauthorized");
  const person = await ctx.db.get(session.registrationId);
  if (!person || person.status !== "approved") throw new Error("Unauthorized");
  return person;
}
export async function active(ctx: ReadCtx, id: Id<"interests">) {
  const interest = await ctx.db.get(id);
  if (!interest?.femaleWorkflow || interest.source !== "platform_submission" || interest.testReset || ["closed", "declined", "withdrawn"].includes(interest.status) || ["declined", "revoked"].includes(interest.femaleWorkflow.state)) throw new Error("Female review unavailable");
  const sister = await ctx.db.get(interest.fromRegistrationId);
  const brother = await ctx.db.get(interest.toRegistrationId);
  if (!sister || !brother || sister.gender !== "female" || brother.gender !== "male" || sister.status !== "approved" || brother.status !== "approved") throw new Error("Applicants unavailable");
  const flow = await ctx.db.query("interestFlows").withIndex("by_interestId", q => q.eq("interestId", id)).unique();
  if (flow && (["closed", "declined"].includes(flow.flowStatus) || flow.fromRegistrationId !== sister._id || flow.toRegistrationId !== brother._id)) throw new Error("Female review unavailable");
  const match = interest.matchId ? await ctx.db.get(interest.matchId) : null;
  if (interest.matchId && (!match || match.testResetAt !== undefined || ["closed", "declined", "paused"].includes(match.status) || match.interestId !== id || match.maleRegistrationId !== brother._id || match.femaleRegistrationId !== sister._id)) throw new Error("Match unavailable");
  return { interest, workflow: interest.femaleWorkflow, sister, brother, flow, match };
}
function checkReview(workflow: NonNullable<Doc<"interests">["femaleWorkflow"]>, hash?: string) {
  if (!workflow.reviewTokenHash || !workflow.reviewExpiresAt || workflow.reviewExpiresAt <= Date.now() || (hash !== undefined && hash !== workflow.reviewTokenHash)) throw new Error("Review link expired or invalid");
}
async function enqueue(ctx: MutationCtx, interest: Doc<"interests">, recipientId: Id<"registrations">, kind: Doc<"femaleWorkflowDeliveries">["kind"]) {
  await enqueueContactDelivery(ctx, interest._id, recipientId, kind);
}
export const createReview = mutation({ args: { ...adminArgs, reviewTokenHash: v.string() }, handler: async (ctx, args) => {
  requireAdmin(args.adminSecret);
  if (!/^[a-f0-9]{64}$/.test(args.reviewTokenHash)) throw new Error("SHA256 review token required");
  const existing = await ctx.db.get(args.interestId);
  if (existing && !existing.femaleWorkflow) {
    const sender = await ctx.db.get(existing.fromRegistrationId);
    const recipient = await ctx.db.get(existing.toRegistrationId);
    if (existing.testReset || existing.matchId || existing.source !== "platform_submission" || existing.visibility !== "internal_only" || !["new", "queued", "active", "deferred"].includes(existing.status) || sender?.gender !== "female" || recipient?.gender !== "male") throw new Error("Female review unavailable");
    // Explicit admin initiation only: never infer either participant's decision or photo consent.
    await ctx.db.patch(existing._id, { femaleWorkflow: { state: "private_documented" } });
  }
  const { interest, workflow } = await active(ctx, args.interestId);
  if (!["private_documented", "awaiting_brother_review"].includes(workflow.state)) throw new Error("Review already decided");
  await ctx.db.patch(interest._id, { femaleWorkflow: { ...workflow, state: "awaiting_brother_review", reviewTokenHash: args.reviewTokenHash, reviewExpiresAt: Date.now() + 7 * 86400000 }, updatedAt: Date.now() });
  return { interestId: interest._id, state: "awaiting_brother_review" as const };
}});
function dashboardRows(ctx: ReadCtx, person: Doc<"registrations">) {
  return person.gender === "male"
    ? ctx.db.query("interests").withIndex("by_toRegistrationId_and_testReset", q => q.eq("toRegistrationId", person._id).eq("testReset", undefined))
    : ctx.db.query("interests").withIndex("by_fromRegistrationId_and_testReset", q => q.eq("fromRegistrationId", person._id).eq("testReset", undefined));
}
async function visibleReviews(ctx: ReadCtx, person: Doc<"registrations">, rows: Doc<"interests">[]) {
  const result = [];
  for (const row of rows) {
    if (!row.femaleWorkflow || (person.gender === "male" && row.femaleWorkflow.state === "private_documented")) continue;
    try { const { workflow } = await active(ctx, row._id); result.push({ interestId: row._id, state: workflow.state, role: person.gender === "male" ? "brother" as const : "sister" as const, reviewExpiresAt: workflow.reviewExpiresAt ?? null, matchId: row.matchId ?? null }); } catch { /* unavailable */ }
  }
  return result;
}
// Compatibility preview; website uses the cursor endpoint below.
export const getDashboard = query({ args: { sessionHash: v.string() }, handler: async (ctx, args) => {
  const person = await actor(ctx, args.sessionHash);
  return await visibleReviews(ctx, person, await dashboardRows(ctx, person).order("desc").take(100));
}});
export const getDashboardPage = query({ args: { sessionHash: v.string(), paginationOpts: paginationOptsValidator }, handler: async (ctx, args) => {
  const person = await actor(ctx, args.sessionHash);
  const page = await dashboardRows(ctx, person).order("desc").paginate({ ...args.paginationOpts, numItems: Math.min(100, Math.max(1, args.paginationOpts.numItems)) });
  // Filter after pagination: an empty visible page must retain its continuation.
  return { ...page, page: await visibleReviews(ctx, person, page.page) };
}});
export const getReviewAccess = query({ args: reviewArgs, handler: async (ctx, args) => {
  const person = await actor(ctx, args.sessionHash);
  const data = await active(ctx, args.interestId);
  if (![data.brother._id, data.sister._id].includes(person._id)) throw new Error("Unauthorized");
  if (data.workflow.state === "private_documented") throw new Error("Review unavailable");
  if (person._id === data.brother._id && (data.workflow.state === "awaiting_brother_review" || args.reviewTokenHash !== undefined)) checkReview(data.workflow, args.reviewTokenHash);
  const profile = person._id === data.brother._id ? data.sister : data.brother;
  const photos = person._id === data.brother._id && data.interest.senderPhotoConsent === "yes" && data.interest.senderPhotoConsentRevokedAt === undefined;
  const imageUrls = photos ? (await Promise.all((profile.imageStorageIds ?? []).map(id => ctx.storage.getUrl(id)))).filter((url): url is string => !!url) : [];
  const released = data.workflow.state === "contacts_released" && !!data.workflow.adminReleasedAt;
  return { interestId: data.interest._id, state: data.workflow.state, role: person._id === data.brother._id ? "brother" as const : "sister" as const, matchId: data.interest.matchId ?? null,
    profile: { name: profile.name, applicantNumber: profile.publicApplicantNumber ?? null, age: profile.age, maritalStatus: profile.maritalStatus, education: profile.education, job: profile.job, ethnicity: profile.ethnicity ?? null, shareableBio: profile.shareableBio ?? null, prayerCommitment: profile.prayerCommitment ?? null, hijabResponse: profile.hijabResponse ?? null, spouseRequirement1: profile.spouseRequirement1 ?? null, spouseRequirement2: profile.spouseRequirement2 ?? null, spouseRequirement3: profile.spouseRequirement3 ?? null, imageUrls, email: released ? profile.email : null, phone: released ? profile.phone : null } };
}});
export const respond = mutation({ args: { ...reviewArgs, decision: v.union(v.literal("accept"), v.literal("decline")) }, handler: async (ctx, args) => {
  const person = await actor(ctx, args.sessionHash);
  const { interest, workflow, brother, sister } = await active(ctx, args.interestId);
  if (person._id !== brother._id) throw new Error("Unauthorized");
  checkReview(workflow, args.reviewTokenHash);
  if (workflow.state === "awaiting_sister_confirmation" && args.decision === "accept") return { state: workflow.state };
  if (workflow.state !== "awaiting_brother_review") throw new Error("Review already decided");
  const state = args.decision === "accept" ? "awaiting_sister_confirmation" as const : "declined" as const;
  await ctx.db.patch(interest._id, { femaleWorkflow: { ...workflow, state, brotherAcceptedAt: args.decision === "accept" ? Date.now() : undefined }, ...(args.decision === "decline" ? { status: "declined" as const, adminStatus: "declined" as const } : {}), updatedAt: Date.now() });
  if (args.decision === "accept") await enqueue(ctx, interest, sister._id, "sister_confirmation");
  return { state };
}});
export const confirm = mutation({ args: { ...applicantArgs, confirmed: v.boolean() }, handler: async (ctx, args) => {
  const person = await actor(ctx, args.sessionHash);
  const { interest, workflow, sister, brother, flow } = await active(ctx, args.interestId);
  if (person._id !== sister._id) throw new Error("Unauthorized");
  if (["pending_admin_approval", "contacts_released"].includes(workflow.state) && args.confirmed) return { state: workflow.state, matchId: interest.matchId! };
  if (workflow.state !== "awaiting_sister_confirmation" || !workflow.brotherAcceptedAt) throw new Error("Brother acceptance required");
  if (!args.confirmed) { await ctx.db.patch(interest._id, { femaleWorkflow: { ...workflow, state: "declined" }, status: "declined", adminStatus: "declined", updatedAt: Date.now() }); return { state: "declined" as const, matchId: null }; }
  for (const applicant of [sister, brother]) if (applicant.activeMatchId) throw new Error("Applicant already has an active match");
  const matches = await ctx.db.query("matches").withIndex("by_maleRegistrationId", q => q.eq("maleRegistrationId", brother._id)).take(1001);
  if (matches.length > 1000 || matches.some(m => m.femaleRegistrationId === sister._id && !["closed", "declined"].includes(m.status))) throw new Error("Pair already has an open match");
  const now = Date.now();
  const matchId = await ctx.db.insert("matches", { maleRegistrationId: brother._id, femaleRegistrationId: sister._id, interestId: interest._id, interestType: "mutual_interest", status: "reviewing", contactGate: "pending_admin_approval", initiatedBy: "interest_signal", createdAt: now, updatedAt: now });
  await ctx.db.patch(interest._id, { matchId, status: "converted_to_match", adminStatus: "matched", femaleWorkflow: { ...workflow, state: "pending_admin_approval", sisterConfirmedAt: now }, updatedAt: now });
  if (flow) await ctx.db.patch(flow._id, { flowStatus: "awaiting_final_approvals", recipientDecision: "accepted", requesterFinalApproval: "approved", recipientFinalApproval: "approved", requesterFinalApprovalAt: now, recipientFinalApprovalAt: workflow.brotherAcceptedAt, bioVisibleAt: now, updatedAt: now });
  for (const recipient of [sister, brother]) await enqueue(ctx, interest, recipient._id, "pending_review");
  return { state: "pending_admin_approval" as const, matchId };
}});
export const releaseContacts = mutation({ args: adminArgs, handler: async (ctx, args) => {
  requireAdmin(args.adminSecret);
  const { interest, workflow, sister, brother, flow, match } = await active(ctx, args.interestId);
  if (workflow.state === "contacts_released") return { state: workflow.state, matchId: interest.matchId! };
  if (workflow.state !== "pending_admin_approval" || !workflow.brotherAcceptedAt || !workflow.sisterConfirmedAt || !match) throw new Error("Explicit bilateral consent required");
  for (const person of [sister, brother]) if (!person.email || !person.phone || (person.activeMatchId && person.activeMatchId !== match._id)) throw new Error("Applicant unavailable or active match conflict");
  const now = Date.now();
  await ctx.db.patch(interest._id, { femaleWorkflow: { ...workflow, state: "contacts_released", adminReleasedAt: now }, updatedAt: now });
  await ctx.db.patch(match._id, { status: "contact_shared", contactGate: "contacts_released", adminReleasedAt: now, updatedAt: now });
  if (flow) { await ctx.db.patch(flow._id, { flowStatus: "contact_shared", contactSharedAt: now, updatedAt: now }); await ctx.db.insert("interestFlowEvents", { interestFlowId: flow._id, interestId: interest._id, actor: "system", eventType: "female_admin_contacts_released", createdAt: now }); }
  for (const person of [sister, brother]) { await ctx.db.patch(person._id, { activeMatchId: match._id }); await demoteOpenInterestsInvolvingRegistration(ctx, person._id, match._id); await enqueue(ctx, interest, person._id, "contacts_ready"); }
  return { state: "contacts_released" as const, matchId: match._id };
}});
export const revokeReview = mutation({ args: adminArgs, handler: async (ctx, args) => {
  requireAdmin(args.adminSecret); const { interest, workflow } = await active(ctx, args.interestId);
  if (interest.matchId) throw new Error("Close official match instead");
  await ctx.db.patch(interest._id, { femaleWorkflow: { ...workflow, state: "revoked", reviewTokenHash: undefined }, status: "closed", updatedAt: Date.now() }); return null;
}});
export const listDeliveries = query({ args: { adminSecret: v.optional(v.string()), interestId: v.optional(v.id("interests")) }, handler: async (ctx, args) => {
  requireAdmin(args.adminSecret);
  if (args.interestId) return await ctx.db.query("femaleWorkflowDeliveries").withIndex("by_interestId", q => q.eq("interestId", args.interestId!)).take(100);
  // Failures have their own bounded queue: newer successful history cannot hide them.
  const failures = await ctx.db.query("femaleWorkflowDeliveries").withIndex("by_status_and_nextAttemptAt", q => q.eq("status", "failed")).take(100);
  const recent = await ctx.db.query("femaleWorkflowDeliveries").order("desc").take(100);
  return [...failures, ...recent.filter(row => !failures.some(f => f._id === row._id))];
}});
export const listDeliveriesPage = query({ args: { adminSecret: v.optional(v.string()), interestId: v.optional(v.id("interests")), view: v.union(v.literal("failed"), v.literal("history")), paginationOpts: paginationOptsValidator }, handler: async (ctx, args) => {
  requireAdmin(args.adminSecret);
  const rows = args.interestId
    ? args.view === "failed"
      ? ctx.db.query("femaleWorkflowDeliveries").withIndex("by_interestId_and_status", q => q.eq("interestId", args.interestId!).eq("status", "failed"))
      : ctx.db.query("femaleWorkflowDeliveries").withIndex("by_interestId", q => q.eq("interestId", args.interestId!))
    : args.view === "failed"
      ? ctx.db.query("femaleWorkflowDeliveries").withIndex("by_status_and_nextAttemptAt", q => q.eq("status", "failed"))
      : ctx.db.query("femaleWorkflowDeliveries");
  return await rows.order(args.view === "failed" ? "asc" : "desc").paginate({ ...args.paginationOpts, numItems: Math.min(100, Math.max(1, args.paginationOpts.numItems)) });
}});
export const retryDelivery = mutation({ args: { adminSecret: v.optional(v.string()), deliveryId: v.id("femaleWorkflowDeliveries") }, handler: async (ctx, args) => {
  requireAdmin(args.adminSecret); const row = await ctx.db.get(args.deliveryId);
  if (!row || row.status !== "failed") throw new Error("Only failed delivery can retry");
  const interest = await ctx.db.get(row.interestId);
  if (interest?.femaleWorkflow) await active(ctx, row.interestId); else await deliveryParticipants(ctx, row.interestId);
  if (row.firstAttemptAt !== undefined && Date.now() - row.firstAttemptAt >= 23 * 3600000) throw new Error("Idempotency window expired; reconcile provider delivery manually");
  await ctx.db.patch(row._id, { status: "pending", nextAttemptAt: Date.now(), error: undefined }); return null;
}});
