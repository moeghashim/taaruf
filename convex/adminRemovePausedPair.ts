import { internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { hash } from "fast-sha256";
import type { Id, TableNames } from "./_generated/dataModel";
import { isSecurityRetired } from "./registrationSecurity";

// Real administrative closure, NOT a test reset or a participant decision.
const scope = { expectedMatchId: v.id("matches"), maleId: v.id("registrations"), femaleId: v.id("registrations"), maleNumber: v.number(), femaleNumber: v.number() };
type Scope = { expectedMatchId: Id<"matches">; maleId: Id<"registrations">; femaleId: Id<"registrations">; maleNumber: number; femaleNumber: number };
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.entries(value).filter(([,v]) => v !== undefined).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => JSON.stringify(k)+":"+canonical(v)).join(",") + "}";
  return JSON.stringify(value);
}
function digest(value: unknown) { return Array.from(hash(new TextEncoder().encode(canonical(value))), b => b.toString(16).padStart(2,"0")).join(""); }
async function snapshot(ctx: QueryCtx, args: Scope) {
  let bytes = 0;
  const scan = async <T extends TableNames>(table: T) => {
    const rows = await ctx.db.query(table).take(10001);
    bytes += new TextEncoder().encode(canonical(rows)).length;
    if (rows.length > 10000 || bytes > 12_000_000) throw Error("Removal scan limit exceeded");
    return rows;
  };
  const pair = (a: string, b: string) => a !== b && [args.maleId,args.femaleId].includes(a as Id<"registrations">) && [args.maleId,args.femaleId].includes(b as Id<"registrations">);
  const registrations = await scan("registrations");
  const male = registrations.find(r => r._id === args.maleId), female = registrations.find(r => r._id === args.femaleId);
  if (!male || !female || male.gender !== "male" || female.gender !== "female" || male.publicApplicantNumber !== args.maleNumber || female.publicApplicantNumber !== args.femaleNumber) throw Error("Expected pair identity changed");
  for (const r of [male,female]) if (r.status !== "approved" || r.profileCompletionStatus !== "completed" || r.searchStatus !== "active" || r.archivedAt !== undefined || isSecurityRetired(r) || (r.activeMatchId && r.activeMatchId !== args.expectedMatchId)) throw Error("Pair availability changed");
  const matches = await scan("matches"), match = matches.find(m => m._id === args.expectedMatchId);
  if (!match || match.status !== "paused" || match.testResetAt !== undefined || match.maleRegistrationId !== male._id || match.femaleRegistrationId !== female._id || !match.interestId) throw Error("Expected paused real match changed");
  if (matches.some(m => m._id !== match._id && ([male._id,female._id].includes(m.maleRegistrationId) || [male._id,female._id].includes(m.femaleRegistrationId)) && !["closed","declined","paused"].includes(m.status))) throw Error("Another blocking match exists");
  const allInterests = await scan("interests");
  const interests = allInterests.filter(i => i.matchId === match._id || i._id === match.interestId);
  if (!interests.length || interests.some(i => !pair(i.fromRegistrationId,i.toRegistrationId) || i.matchId !== match._id || i.testReset || i.source !== "platform_submission")) throw Error("Unexpected real interest reference");
  const selected = (id: Id<"interests"> | undefined) => !!id && interests.some(i => i._id === id);
  if (allInterests.some(i => (selected(i.canonicalInterestId) && !selected(i._id)) || (selected(i._id) && i.canonicalInterestId && !selected(i.canonicalInterestId)))) throw Error("Unlinked canonical reference");
  const pointers = registrations.filter(r => r.activeMatchId === match._id);
  if (pointers.some(r => ![male._id,female._id].includes(r._id))) throw Error("Foreign active pointer");
  const flows = (await scan("interestFlows")).filter(f => selected(f.interestId));
  if (interests.some(i => flows.filter(f => f.interestId === i._id).length !== 1) || flows.some(f => !pair(f.fromRegistrationId,f.toRegistrationId))) throw Error("Unexpected flow reference");
  const shares = (await scan("profileShares")).filter(s => s.matchId === match._id || selected(s.interestId));
  if (shares.some(s => !pair(s.ownerRegistrationId,s.recipientRegistrationId) || (s.matchId && s.matchId !== match._id) || (s.interestId && !selected(s.interestId)))) throw Error("Foreign share reference");
  const contacts = (await scan("contactReleaseEmails")).filter(d => d.matchId === match._id);
  const deliveries = (await scan("femaleWorkflowDeliveries")).filter(d => selected(d.interestId));
  const notifications = (await scan("matchmakerNotifications")).filter(n => n.matchId === match._id);
  for (const d of [...contacts,...deliveries,...notifications]) if (![male._id,female._id].includes(d.recipientId) || ["sending","claimed"].includes(d.status)) throw Error("In-flight or foreign delivery; reconcile first");
  return { match, interests, flows, shares, contacts, deliveries, notifications, pointers, participants: [male,female] };
}
export const preview = internalQuery({ args: scope, handler: async (ctx,args) => {
  const s = await snapshot(ctx,args);
  return { fingerprint: digest(s), matchId: s.match._id, interests: s.interests.length, shares: s.shares.length, acceptedReceiptsPreserved: [...s.contacts,...s.deliveries,...s.notifications].filter(d => d.status === "sent").length };
}});
export const remove = internalMutation({ args: { ...scope, expectedFingerprint: v.string(), confirm: v.literal("REMOVE PAUSED REAL CONNECTION; NO PARTICIPANT DECLINE") }, handler: async (ctx,args) => {
  const operationKey = "admin-remove-paused-real/v1/" + args.expectedMatchId;
  const prior = await ctx.db.query("adminPairRemovalAudits").withIndex("by_operationKey",q => q.eq("operationKey",operationKey)).unique();
  const request = canonical(args);
  if (prior) { if (prior.request !== request) throw Error("Removal already used with different request"); return { alreadyRemoved: true, auditId: prior._id }; }
  const s = await snapshot(ctx,args);
  if (digest(s) !== args.expectedFingerprint) throw Error("Preview changed");
  const saved = canonical(s), now = Date.now();
  if (new TextEncoder().encode(saved).length > 700000) throw Error("Removal snapshot too large");
  const auditId = await ctx.db.insert("adminPairRemovalAudits",{ operationKey, request, snapshot: saved, createdAt: now });
  for (const i of s.interests) await ctx.db.patch(i._id, { adminRemovedAt: now, status: "closed", adminStatus: undefined, matchId: undefined, femaleWorkflow: i.femaleWorkflow ? { ...i.femaleWorkflow, state: "revoked", reviewTokenHash: undefined, reviewExpiresAt: undefined, adminReleasedAt: undefined } : undefined, updatedAt: now });
  for (const f of s.flows) {
    await ctx.db.patch(f._id,{ flowStatus: "closed", contactSharedAt: undefined, photosVisibleAt: undefined, keepOpenExpiresAt: undefined, closedReason: "admin_removed_connection", updatedAt: now });
    await ctx.db.insert("interestFlowEvents",{ interestFlowId: f._id, interestId: f.interestId, actor: "admin", eventType: "admin_removed_connection", message: "Administrative connection removal; not a participant decline.", createdAt: now });
  }
  for (const s1 of s.shares) await ctx.db.patch(s1._id,{ matchId: undefined, revokedAt: now, includeImages: false, updatedAt: now });
  // Sent rows are immutable receipts, not live contact capabilities. Their match ID
  // is historical provenance. Never delete them or clear provider acceptance data.
  for (const d of [...s.contacts,...s.deliveries]) if (["pending","failed"].includes(d.status)) await ctx.db.patch(d._id,{status:"cancelled",leaseUntil:undefined});
  for (const n of s.notifications) if (n.status !== "sent") await ctx.db.delete(n._id);
  for (const r of s.pointers) await ctx.db.patch(r._id,{activeMatchId:undefined});
  await ctx.db.delete(s.match._id);
  return { alreadyRemoved: false, auditId };
}});
