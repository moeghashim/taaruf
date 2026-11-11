import { assertNotArchived } from "./archiveRules";
import { interestBioVisible } from "./bioVisibility";
import { currentSisterConfirmation } from "./sisterConfirmationActivation";
import { currentAge } from "./birthdays";
import { deliveryAuthorized } from "./brotherReviewActivation";
import { sessionAllowed } from "./capabilitySecurity";
import { contactsVisible, enqueueContactDelivery, deliveryParticipants, linkedFlows, recordPairApproval, releasePairContacts } from "./contactGate";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAdmin } from "./adminAuthorization";
import { demoteOpenInterestsInvolvingRegistration, createInitialInterestFlow } from "./interestRules";

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
  assertNotArchived(person);
  return person;
}
export async function active(ctx: ReadCtx, id: Id<"interests">, allowPaused = false) {
  const interest = await ctx.db.get(id);
  if (!interest?.femaleWorkflow || interest.testReset || ["closed", "declined", "withdrawn"].includes(interest.status) || ["declined", "revoked"].includes(interest.femaleWorkflow.state)) throw new Error("Female review unavailable");
  const sister = await ctx.db.get(interest.fromRegistrationId);
  const brother = await ctx.db.get(interest.toRegistrationId);
  if (!sister || !brother || sister.gender !== "female" || brother.gender !== "male" || sister.status !== "approved" || brother.status !== "approved") throw new Error("Applicants unavailable");
  assertNotArchived(sister);
  assertNotArchived(brother);
  const flow = await ctx.db.query("interestFlows").withIndex("by_interestId", q => q.eq("interestId", id)).unique();
  if (flow && (["closed", "declined"].includes(flow.flowStatus) || flow.fromRegistrationId !== sister._id || flow.toRegistrationId !== brother._id)) throw new Error("Female review unavailable");
  const match = interest.matchId ? await ctx.db.get(interest.matchId) : null;
  if (interest.matchId && (!match || match.testResetAt !== undefined || (["closed", "declined"].includes(match.status) || (!allowPaused && match.status === "paused")) || match.maleRegistrationId !== brother._id || match.femaleRegistrationId !== sister._id)) throw new Error("Match unavailable");
  if (match) await linkedFlows(ctx, interest);
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
    if (existing.testReset || existing.matchId || existing.visibility !== "internal_only" || !["new", "queued", "active", "deferred"].includes(existing.status) || sender?.gender !== "female" || recipient?.gender !== "male") throw new Error("Female review unavailable");
    // Explicit admin initiation only: never infer either participant's decision or photo consent.
    await ctx.db.patch(existing._id, { femaleWorkflow: { state: "private_documented" } });
  }
  if (existing) await createInitialInterestFlow(ctx, existing);
  const { interest, workflow, flow, match, brother } = await active(ctx, args.interestId);
  if (!["private_documented", "awaiting_brother_review"].includes(workflow.state)) throw new Error("Review already decided");
  if (match && (!flow || flow.requesterFinalApproval !== "approved" || flow.recipientFinalApproval !== "approved")) throw new Error("Explicit bilateral consent required");
  const releasedAt = match?.adminReleasedAt ?? flow?.contactSharedAt;
  const released = match?.contactGate === "contacts_released" || (!!match && !match.contactGate && flow?.contactSharedAt !== undefined);
  const state = match ? released ? "contacts_released" as const : "pending_admin_approval" as const : "awaiting_brother_review" as const;
  await ctx.db.patch(interest._id, { femaleWorkflow: { ...workflow, state, ...(released ? { adminReleasedAt: releasedAt } : {}), reviewTokenHash: args.reviewTokenHash, reviewExpiresAt: Date.now() + 7 * 86400000 }, updatedAt: Date.now() });
  // One durable invitation per interest/recipient, including token reissues.
  // Only an explicit admin share can enqueue, never dashboard reads.
  if (state === "awaiting_brother_review") await enqueue(ctx, interest, brother._id, "brother_review");
  return { interestId: interest._id, state };
}});
function dashboardRows(ctx: ReadCtx, person: Doc<"registrations">) {
  return person.gender === "male"
    ? ctx.db.query("interests").withIndex("by_toRegistrationId_and_testReset", q => q.eq("toRegistrationId", person._id).eq("testReset", undefined))
    : ctx.db.query("interests").withIndex("by_fromRegistrationId_and_testReset", q => q.eq("fromRegistrationId", person._id).eq("testReset", undefined));
}
// Applicant projection: workflow stages and counterpart decisions remain server-only.
function applicantReview(row: Doc<"interests">, role: "brother" | "sister", flow: Doc<"interestFlows"> | null, paused = false, closed = false, released = false) {
  const workflow = row.femaleWorkflow!;
  const ownDecision = (role === "brother" ? flow?.recipientFinalApproval : flow?.requesterFinalApproval)
    ?? ((role === "brother" ? workflow.brotherAcceptedAt : workflow.sisterConfirmedAt) !== undefined ? "approved" : "pending");
  const ownReview = role === "brother" ? workflow.state === "awaiting_brother_review" : workflow.state === "awaiting_sister_confirmation" && !row.matchId;
  const expired = role === "brother" && ownReview && (!workflow.reviewExpiresAt || workflow.reviewExpiresAt <= Date.now());
  return { interestId: row._id, role, paused: released && paused, ownDecision,
    state: closed ? "closed" as const : workflow.state === "contacts_released" ? "contacts_released" as const : "in_review" as const,
    ownAction: !closed && !paused && ownReview && !expired ? "review" as const : null,
    reviewExpired: !closed && expired,
    // Match creation is private until contact release.
    canPause: !closed && released && !!row.matchId,
    canView: !closed && workflow.state !== "private_documented" && !!workflow.reviewTokenHash,
  };
}
async function visibleReviews(ctx: ReadCtx, person: Doc<"registrations">, rows: Doc<"interests">[]) {
  const result = [];
  for (const row of rows) {
    if (!row.femaleWorkflow || (person.gender === "male" && (row.femaleWorkflow.state === "private_documented" || !row.femaleWorkflow.reviewTokenHash))) continue;
    const role = person.gender === "male" ? "brother" as const : "sister" as const;
    try { const { flow, match } = await active(ctx, row._id, true); result.push(applicantReview(row, role, flow, match?.status === "paused", false, await contactsVisible(ctx, row, flow))); }
    catch {
      // Retain only neutral history, never restore profile/contact access on closure.
      if (row.testReset) continue;
      const match = row.matchId ? await ctx.db.get(row.matchId) : null;
      if (match?.testResetAt !== undefined) continue;
      const flow = await ctx.db.query("interestFlows").withIndex("by_interestId", q => q.eq("interestId", row._id)).unique();
      if (flow && (flow.fromRegistrationId !== row.fromRegistrationId || flow.toRegistrationId !== row.toRegistrationId)) continue;
      result.push(applicantReview(row, role, flow, false, true));
    }
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
  const data = await active(ctx, args.interestId, true);
  if (![data.brother._id, data.sister._id].includes(person._id)) throw new Error("Unauthorized");
  if (data.workflow.state === "private_documented" || !data.workflow.reviewTokenHash) throw new Error("Review unavailable");
  if (person._id === data.brother._id && (data.workflow.state === "awaiting_brother_review" || args.reviewTokenHash !== undefined)) checkReview(data.workflow, args.reviewTokenHash);
  const profile = person._id === data.brother._id ? data.sister : data.brother;
  const photos = person._id === data.brother._id && data.interest.senderPhotoConsent === "yes" && data.interest.senderPhotoConsentRevokedAt === undefined;
  const imageUrls = photos ? (await Promise.all((profile.imageStorageIds ?? []).map(id => ctx.storage.getUrl(id)))).filter((url): url is string => !!url) : [];
  const released = data.workflow.state === "contacts_released" && !!data.workflow.adminReleasedAt;
  return { ...applicantReview(data.interest, person._id === data.brother._id ? "brother" : "sister", data.flow, data.match?.status === "paused", false, await contactsVisible(ctx, data.interest, data.flow)),
    profile: { ...(person._id === data.brother._id ? {} : { name: profile.name }), label: person._id === data.brother._id ? `Applicant #${profile.publicApplicantNumber ?? "—"}` : profile.name, applicantNumber: profile.publicApplicantNumber ?? null, age: await currentAge(ctx, profile), maritalStatus: profile.maritalStatus, education: profile.education, job: profile.job, ethnicity: profile.ethnicity ?? null, shareableBio: await interestBioVisible(ctx, data.interest) ? profile.shareableBio ?? null : null, prayerCommitment: profile.prayerCommitment ?? null, hijabResponse: profile.hijabResponse ?? null, spouseRequirement1: profile.spouseRequirement1 ?? null, spouseRequirement2: profile.spouseRequirement2 ?? null, spouseRequirement3: profile.spouseRequirement3 ?? null, imageUrls, email: released ? profile.email : null, phone: released ? profile.phone : null } };
}});
export const respond = mutation({ args: { ...reviewArgs, decision: v.union(v.literal("accept"), v.literal("decline")) }, handler: async (ctx, args) => {
  const person = await actor(ctx, args.sessionHash);
  const { interest, workflow, brother, sister } = await active(ctx, args.interestId);
  if (person._id !== brother._id) throw new Error("Unauthorized");
  if (!workflow.reviewTokenHash) throw new Error("Review unavailable");
  if (["pending_admin_approval", "contacts_released"].includes(workflow.state) && args.decision === "accept") return { ownDecision: "approved" as const };
  checkReview(workflow, args.reviewTokenHash);
  if (workflow.state === "awaiting_sister_confirmation" && args.decision === "accept") return { ownDecision: "approved" as const };
  if (workflow.state !== "awaiting_brother_review") throw new Error("Review already decided");
  const state = args.decision === "accept" ? "awaiting_sister_confirmation" as const : "declined" as const;
  if (args.decision === "decline") await recordPairApproval(ctx, interest, person._id, false);
  await ctx.db.patch(interest._id, { femaleWorkflow: { ...workflow, state, brotherAcceptedAt: args.decision === "accept" ? Date.now() : undefined }, ...(args.decision === "decline" ? { status: "declined" as const, adminStatus: "declined" as const } : {}), updatedAt: Date.now() });
  if (args.decision === "accept") {
    const flow = await ctx.db.query("interestFlows").withIndex("by_interestId", q => q.eq("interestId", interest._id)).unique();
    if (flow) await ctx.db.patch(flow._id, { recipientDecision: "accepted", bioVisibleAt: flow.bioVisibleAt ?? Date.now(), updatedAt: Date.now() });
  }
  const matchId = args.decision === "accept" ? await recordPairApproval(ctx, (await ctx.db.get(interest._id))!, person._id, true) : null;
  if (args.decision === "accept" && !matchId) await enqueue(ctx, interest, sister._id, "sister_confirmation");
  return { ownDecision: args.decision === "accept" ? "approved" as const : "declined" as const };
}});
export const confirm = mutation({ args: { ...applicantArgs, confirmed: v.boolean() }, handler: async (ctx, args) => {
  const person = await actor(ctx, args.sessionHash);
  const { interest, workflow } = await active(ctx, args.interestId);
  if (person._id !== interest.fromRegistrationId) throw new Error("Unauthorized");
  if (!workflow.reviewTokenHash) throw new Error("Review unavailable");
  if (["pending_admin_approval", "contacts_released"].includes(workflow.state) && args.confirmed) return { ownDecision: "approved" as const };
  if (workflow.state !== "awaiting_sister_confirmation" || !workflow.brotherAcceptedAt) throw new Error("Review unavailable");
  if (!args.confirmed) { await recordPairApproval(ctx, interest, person._id, false); await ctx.db.patch(interest._id, { femaleWorkflow: { ...workflow, state: "declined" }, status: "declined", adminStatus: "declined", updatedAt: Date.now() }); return { ownDecision: "declined" as const }; }
  const matchId = await recordPairApproval(ctx, interest, person._id, true);
  if (!matchId) throw new Error("Explicit bilateral consent required");
  return { ownDecision: "approved" as const };
}});
export const releaseContacts = mutation({ args: adminArgs, handler: async (ctx, args) => {
  requireAdmin(args.adminSecret);
  const { interest, match } = await active(ctx, args.interestId);
  if (!match) throw new Error("Valid match required");
  await releasePairContacts(ctx, match);
  for (const id of [match.maleRegistrationId, match.femaleRegistrationId]) await demoteOpenInterestsInvolvingRegistration(ctx, id, match._id);
  return { state: "contacts_released" as const, matchId: interest.matchId! };
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
  if (!row || row.resetAuditId !== undefined || row.status !== "failed") throw new Error("Only failed delivery can retry");
  if (!await deliveryAuthorized(ctx, row)) throw new Error("Delivery unavailable: not authorized by activation boundary/kind");
  const interest = await ctx.db.get(row.interestId);
  if (interest?.femaleWorkflow) {
    const { workflow, brother, sister } = await active(ctx, row.interestId, true);
    if (row.kind === "sister_confirmation" && (!currentSisterConfirmation(interest, row) || (row.sisterRecipientEmail !== undefined && row.sisterRecipientEmail !== sister.email))) throw new Error("Sister confirmation unavailable for retry");
    if (row.kind === "brother_review" && (row.recipientId !== brother._id || workflow.state !== "awaiting_brother_review" || !workflow.reviewTokenHash || !workflow.reviewExpiresAt || workflow.reviewExpiresAt <= Date.now())) throw new Error("Review unavailable for retry");
  } else await deliveryParticipants(ctx, row.interestId);
  if (row.firstAttemptAt !== undefined && Date.now() - row.firstAttemptAt >= 23 * 3600000) throw new Error("Idempotency window expired; reconcile provider delivery manually");
  await ctx.db.patch(row._id, { status: "pending", nextAttemptAt: Date.now(), error: undefined }); return null;
}});
