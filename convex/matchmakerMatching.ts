import { isSecurityRetired } from "./registrationSecurity";
import { currentAge } from "./birthdays";
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { assertNotArchived } from "./archiveRules";
import { sessionAllowed } from "./capabilitySecurity";
import { requireAdmin } from "./adminAuthorization";
import { assertParticipantsAvailable, releasePairContacts } from "./contactGate";

type ReadCtx = QueryCtx | MutationCtx;
const activationKey = "matchmakerEmailActivationAt";
async function emailActivation(ctx: ReadCtx) {
  const row = await ctx.db.query("settings").withIndex("by_key", q => q.eq("key", activationKey)).unique();
  const at = Number(row?.value);
  return Number.isSafeInteger(at) && at > 0 ? at : null;
}
// Immutable operator-only cutoff; deployment alone never enables email.
export const prepareEmailActivation = internalMutation({args: {}, handler: async ctx => {
  const existing = await emailActivation(ctx);
  if (existing !== null) return {activationAt: existing};
  const activationAt = Date.now();
  await ctx.db.insert("settings", {key: activationKey, value: String(activationAt)});
  return {activationAt};
}});
export const emailReadiness = query({args: {adminSecret: v.optional(v.string())}, handler: async (ctx, args) => {
  requireAdmin(args.adminSecret);
  return {activationAt: await emailActivation(ctx)};
}});
function manual(m: Doc<"matches">) { return !m.interestId && (m.interestType === "admin_suggested" || m.initiatedBy === "admin_recommendation"); }
function released(m: Doc<"matches">) { return m.contactGate === "contacts_released" || m.adminReleasedAt !== undefined || m.status === "contact_shared" || m.contactSharedNotificationSentAt !== undefined; }
function publicFollowup(f: Doc<"matches">["maleFollowup"]) { return f ? {status: f.status, updatedAt: f.updatedAt} : undefined; }
function active(m: Doc<"matches">) { return m.closedReason !== "participant_archived" && m.matchmakerWithdrawnAt === undefined && !["closed", "declined", "paused"].includes(m.status); }
async function person(ctx: ReadCtx, hash: string) {
  const session = await ctx.db.query("applicantSessions").withIndex("by_sessionHash", q => q.eq("sessionHash", hash)).unique();
  if (!session || !await sessionAllowed(ctx, session)) throw new Error("Unauthorized");
  const row = await ctx.db.get(session.registrationId);
  if (!row) throw new Error("Unauthorized");
  return row;
}
async function ownMatch(ctx: ReadCtx, hash: string, id: Id<"matches">) {
  const owner = await person(ctx, hash);
  const match = await ctx.db.get(id);
  if (!match || !manual(match) || match.testResetAt !== undefined || ![match.maleRegistrationId, match.femaleRegistrationId].includes(owner._id) || (match.matchmakerPresentedAt === undefined && !released(match))) throw new Error("Match unavailable");
  return {owner, match};
}
export const setConsent = mutation({
  args: {sessionHash: v.string(), optedIn: v.boolean()},
  handler: async (ctx, args) => {
    const owner = await person(ctx, args.sessionHash);
    // Withdrawal of future consideration is always possible, including archived profiles.
    if (args.optedIn) assertNotArchived(owner);
    await ctx.db.patch(owner._id, {backgroundMatchmakingOptIn: args.optedIn, backgroundMatchmakingConsentUpdatedAt: Date.now()});
    return null;
  },
});
export const present = mutation({
  args: {adminSecret: v.optional(v.string()), matchId: v.id("matches"), emailReady: v.optional(v.boolean())},
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    const match = await ctx.db.get(args.matchId);
    if (!match || !manual(match) || match.testResetAt !== undefined || !active(match)) throw new Error("Match unavailable");
    assertNotArchived(await ctx.db.get(match.maleRegistrationId));
    assertNotArchived(await ctx.db.get(match.femaleRegistrationId));
    if (match.matchmakerPresentedAt !== undefined) return {alreadyPresented: true};
    if (released(match)) throw new Error("Historical contact-shared matches cannot be presented again");
    const {male, female} = await assertParticipantsAvailable(ctx, match.maleRegistrationId, match.femaleRegistrationId, match._id);
    for (const p of [male, female]) {
      if (p.backgroundMatchmakingOptIn !== true) throw new Error("Both applicants must opt in to background matchmaking");
      if (p.profileCompletionStatus !== "completed" || (p.searchStatus ?? "active") !== "active") throw new Error("Both applicants must have complete profiles and be actively searching");
    }
    // Do not reclassify an applicant-origin connection as a recommendation.
    for (const [from, to] of [[male._id, female._id], [female._id, male._id]]) {
      for await (const interest of ctx.db.query("interests").withIndex("by_fromRegistrationId_and_toRegistrationId", q => q.eq("fromRegistrationId", from).eq("toRegistrationId", to))) {
        if (!interest.testReset && !["closed", "declined", "withdrawn"].includes(interest.status)) throw new Error("Use the existing applicant interest workflow");
      }
    }
    const now = Date.now();
    const activationAt = await emailActivation(ctx);
    const emailEligible = args.emailReady === true && activationAt !== null && now > activationAt;
    await ctx.db.patch(match._id, {matchmakerPresentedAt: now, status: "reviewing", updatedAt: now});
    for (const p of [male, female]) {
      const key = "matchmaker:" + match._id + ":" + p._id;
      if (!await ctx.db.query("matchmakerNotifications").withIndex("by_key", q => q.eq("key", key)).unique()) await ctx.db.insert("matchmakerNotifications", {matchId: match._id, recipientId: p._id, key, status: emailEligible ? "pending" : "failed", createdAt: now, ...(emailEligible ? {activationAt: activationAt!} : {})});
    }
    return {alreadyPresented: false};
  },
});
export const getMine = query({
  args: {sessionHash: v.string()},
  handler: async (ctx, args) => {
    const owner = await person(ctx, args.sessionHash);
    const rows = owner.gender === "male"
      ? await ctx.db.query("matches").withIndex("by_maleRegistrationId", q => q.eq("maleRegistrationId", owner._id)).order("desc").take(1001)
      : await ctx.db.query("matches").withIndex("by_femaleRegistrationId", q => q.eq("femaleRegistrationId", owner._id)).order("desc").take(1001);
    if (rows.length > 1000) throw new Error("Match history requires support review");
    const matches = [];
    for (const m of rows) {
      if (!manual(m) || m.testResetAt !== undefined || (m.matchmakerPresentedAt === undefined && !released(m))) continue;
      const male = m.maleRegistrationId === owner._id;
      const p = await ctx.db.get(male ? m.femaleRegistrationId : m.maleRegistrationId);
      const accessible = owner.archivedAt === undefined && !isSecurityRetired(owner) && p?.archivedAt === undefined && !isSecurityRetired(p) && m.closedReason !== "participant_archived" &&
        ![owner, p].some(person => person?.lastRestoredArchivedAt !== undefined && m.createdAt <= person.lastRestoredArchivedAt);
      const contactShared = released(m);
      const images = accessible && (contactShared || active(m)) && p?.photoSharingPermission === "yes" ? (await Promise.all((p.imageStorageIds ?? []).map(async storageId => ({storageId, url: await ctx.storage.getUrl(storageId)})))).filter(image => image.url !== null) : [];
      matches.push({_id: m._id, status: m.status === "declined" ? "closed" : m.status, presentedAt: m.matchmakerPresentedAt, contactShared, canWithdraw: accessible && !contactShared && m.matchmakerWithdrawnAt === undefined, canApprove: accessible && !contactShared && active(m) && p !== null && owner.status === "approved", withdrawnAt: m.matchmakerWithdrawnBy === owner._id ? m.matchmakerWithdrawnAt : undefined,
        myApproval: (male ? m.maleMatchmakerApprovalAt : m.femaleMatchmakerApprovalAt) !== undefined,
        myFollowup: publicFollowup(male ? m.maleFollowup : m.femaleFollowup),
        partner: accessible && p ? {publicApplicantNumber: p.publicApplicantNumber, age: await currentAge(ctx, p), gender: p.gender, maritalStatus: p.maritalStatus, education: p.education, job: p.job, ethnicity: p.ethnicity, prayerCommitment: p.prayerCommitment, hijabResponse: p.hijabResponse, spouseRequirement1: p.spouseRequirement1, spouseRequirement2: p.spouseRequirement2, spouseRequirement3: p.spouseRequirement3, shareableBio: p.shareableBio, images, ...(contactShared ? {name: p.name, email: p.email, phone: p.phone} : {})} : null});
    }
    return {optedIn: owner.backgroundMatchmakingOptIn === true, consentUpdatedAt: owner.backgroundMatchmakingConsentUpdatedAt, matches};
  },
});
const applicantMatchArgs = {sessionHash: v.string(), matchId: v.id("matches")};
export const approve = mutation({args: applicantMatchArgs, handler: async (ctx, args) => {
  const {owner, match} = await ownMatch(ctx, args.sessionHash, args.matchId);
  assertNotArchived(owner);
  assertNotArchived(await ctx.db.get(owner._id === match.maleRegistrationId ? match.femaleRegistrationId : match.maleRegistrationId));
  if (!active(match) || owner.status !== "approved") throw new Error("Match unavailable");
  if (released(match)) return null;
  const field = owner._id === match.maleRegistrationId ? "maleMatchmakerApprovalAt" : "femaleMatchmakerApprovalAt";
  if (match[field] === undefined) await ctx.db.patch(match._id, {[field]: Date.now(), updatedAt: Date.now()});
  return null;
}});
export const withdraw = mutation({args: applicantMatchArgs, handler: async (ctx, args) => {
  const {owner, match} = await ownMatch(ctx, args.sessionHash, args.matchId);
  if (released(match)) throw new Error("Contacts have already been shared; this record is retained");
  if (match.matchmakerWithdrawnAt !== undefined) return null;
  await ctx.db.patch(match._id, {status: "closed", matchmakerWithdrawnAt: Date.now(), matchmakerWithdrawnBy: owner._id, updatedAt: Date.now()});
  return null;
}});
export const followup = mutation({args: {...applicantMatchArgs, status: v.union(v.literal("contact_made"), v.literal("getting_to_know"), v.literal("not_proceeding"), v.literal("engaged"))}, handler: async (ctx, args) => {
  const {owner, match} = await ownMatch(ctx, args.sessionHash, args.matchId);
  if (!released(match)) throw new Error("Contacts must be shared before a follow-up");
  await ctx.db.patch(match._id, {[owner._id === match.maleRegistrationId ? "maleFollowup" : "femaleFollowup"]: {status: args.status, authorRegistrationId: owner._id, updatedAt: Date.now()}, updatedAt: Date.now()});
  return null;
}});
export const releaseContacts = mutation({args: {adminSecret: v.optional(v.string()), matchId: v.id("matches")}, handler: async (ctx, args) => {
  requireAdmin(args.adminSecret);
  const match = await ctx.db.get(args.matchId);
  if (!match || !manual(match)) throw new Error("Match unavailable");
  await releasePairContacts(ctx, match);
  return null;
}});
export const claimNotification = mutation({args: {adminSecret: v.optional(v.string()), matchId: v.id("matches"), recipientId: v.id("registrations")}, handler: async (ctx, args) => {
  requireAdmin(args.adminSecret);
  const cooldown = await ctx.db.query("settings").withIndex("by_key", q => q.eq("key", "matchmakerEmailCooldownUntil")).unique();
  if (cooldown && Number(cooldown.value) > Date.now()) return null;
  const m = await ctx.db.get(args.matchId);
  if (!m || !manual(m) || m.matchmakerPresentedAt === undefined || m.testResetAt !== undefined || !active(m) || ![m.maleRegistrationId, m.femaleRegistrationId].includes(args.recipientId)) throw new Error("Match unavailable");
  assertNotArchived(await ctx.db.get(m.maleRegistrationId));
  assertNotArchived(await ctx.db.get(m.femaleRegistrationId));
  const key = "matchmaker:" + m._id + ":" + args.recipientId;
  const delivery = await ctx.db.query("matchmakerNotifications").withIndex("by_key", q => q.eq("key", key)).unique();
  if (!delivery || delivery.status !== "pending") return null;
  const activationAt = await emailActivation(ctx);
  if (activationAt === null || delivery.activationAt !== activationAt || m.matchmakerPresentedAt <= activationAt || delivery.createdAt <= activationAt || released(m)) return null;
  const {male, female} = await assertParticipantsAvailable(ctx, m.maleRegistrationId, m.femaleRegistrationId, m._id);
  if ([male, female].some(p => p.backgroundMatchmakingOptIn !== true || p.profileCompletionStatus !== "completed" || (p.searchStatus ?? "active") !== "active")) return null;
  const p = await ctx.db.get(args.recipientId);
  if (!p || p.status !== "approved") throw new Error("Applicant unavailable");
  await ctx.db.patch(delivery._id, {status: "claimed", claimedAt: Date.now()});
  return {deliveryId: delivery._id, key, email: p.email, name: p.name};
}});
export const recordNotification = mutation({args: {adminSecret: v.optional(v.string()), deliveryId: v.id("matchmakerNotifications"), sent: v.boolean(), retryAfterMs: v.optional(v.number())}, handler: async (ctx, args) => {
  requireAdmin(args.adminSecret);
  if (args.retryAfterMs !== undefined) {
    const setting = await ctx.db.query("settings").withIndex("by_key", q => q.eq("key", "matchmakerEmailCooldownUntil")).unique();
    const value = String(Math.max(Number(setting?.value ?? 0), Date.now() + Math.max(60000, args.retryAfterMs)));
    if (setting) await ctx.db.patch(setting._id, {value}); else await ctx.db.insert("settings", {key: "matchmakerEmailCooldownUntil", value});
  }
  const delivery = await ctx.db.get(args.deliveryId);
  if (!delivery || delivery.status !== "claimed") return null;
  await ctx.db.patch(delivery._id, {status: args.sent ? "sent" : "failed", completedAt: Date.now()});
  return null;
}});
