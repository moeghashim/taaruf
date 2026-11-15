import { internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { hash } from "fast-sha256";
import type { TableNames } from "./_generated/dataModel";

// One-time authorization5910. No caller-selected pair, broad reset or queue promotion.
import { TARGETS, PAIR, INTEREST } from "./removeTestMatches5910Scope";
function canonical(x: unknown): string {
  if (Array.isArray(x)) return "[" + x.map(canonical).join(",") + "]";
  if (x && typeof x === "object") return "{" + Object.entries(x).filter(([,v]) => v !== undefined).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => JSON.stringify(k)+":"+canonical(v)).join(",") + "}";
  return JSON.stringify(x);
}
function digest(x: unknown) { return Array.from(hash(new TextEncoder().encode(canonical(x))), b => b.toString(16).padStart(2,"0")).join(""); }
async function snapshot(ctx: QueryCtx) {
  let bytes = 0;
  const scan = async <T extends TableNames>(table: T) => {
    const rows = await ctx.db.query(table).take(10001);
    bytes += new TextEncoder().encode(canonical(rows)).length;
    if (rows.length > 10000 || bytes > 12_000_000) throw Error("Scan limit exceeded");
    return rows;
  };
  const selected = (id: string | undefined) => !!id && (TARGETS as readonly string[]).includes(id);
  const pair = (a: string,b: string) => a !== b && (PAIR as readonly string[]).includes(a) && (PAIR as readonly string[]).includes(b);
  const registrations = await scan("registrations"), allMatches = await scan("matches");
  for (const [i,id] of PAIR.entries()) if (registrations.find(r=>r._id===id)?.publicApplicantNumber !== [334,220][i]) throw Error("Test pair identity changed");
  const matches = allMatches.filter(m=>selected(m._id));
  if (matches.length !== 2) throw Error("Expected both exact matches");
  for (const m of matches) {
    if (m.maleRegistrationId !== PAIR[0] || m.femaleRegistrationId !== PAIR[1] || m.status !== "closed" || !m.adminNotes?.startsWith("TEST") || m.contactGate === "contacts_released" || m.adminReleasedAt !== undefined || m.contactSharedNotificationSentAt !== undefined || m.testResetAt !== undefined) throw Error("Unexpected test match state");
    if (m.interestId !== (m._id === TARGETS[1] ? INTEREST : undefined)) throw Error("Unexpected match interest");
  }
  const interests = (await scan("interests")).filter(i=>selected(i.matchId) || i._id === INTEREST);
  if (interests.length !== 1 || interests[0]._id !== INTEREST || interests[0].matchId !== TARGETS[1] || interests[0].status !== "closed" || !pair(interests[0].fromRegistrationId,interests[0].toRegistrationId)) throw Error("Unexpected interest references");
  const pointers = registrations.filter(r=>selected(r.activeMatchId));
  if (pointers.some(r=>!(PAIR as readonly string[]).includes(r._id))) throw Error("Foreign active pointer");
  const shares = (await scan("profileShares")).filter(s=>selected(s.matchId));
  for (const s of shares) if (!pair(s.ownerRegistrationId,s.recipientRegistrationId) || s.status !== "closed" || s.includeImages || (s.interestId && s.interestId !== INTEREST)) throw Error("Unsafe share reference");
  const notifications = (await scan("matchmakerNotifications")).filter(n=>selected(n.matchId));
  for (const n of notifications) if (!(PAIR as readonly string[]).includes(n.recipientId) || n.status === "claimed") throw Error("In-flight or foreign notification");
  // Never erase delivery receipts or race a contact send. This fixture released no contacts.
  if ((await scan("contactReleaseEmails")).some(d=>selected(d.matchId))) throw Error("Contact delivery history requires separate review");
  const state = {matches, interests, pointers, shares, notifications};
  return {state, fingerprint:digest(state)};
}
export const preview = internalQuery({args:{}, handler: async(ctx)=> {
  const s=await snapshot(ctx);
  return {fingerprint:s.fingerprint, matchIds:s.state.matches.map(m=>m._id), detachInterests:s.state.interests.length, clearPointers:s.state.pointers.length, detachShares:s.state.shares.length, deleteNotifications:s.state.notifications.length};
}});
export const remove = internalMutation({args:{expectedIds:v.array(v.id("matches")),expectedFingerprint:v.string(),confirm:v.literal("DELETE BOTH TEST MATCHES 334-220 / 5910")}, handler:async(ctx,args)=>{
  if (canonical([...args.expectedIds].sort()) !== canonical([...TARGETS].sort())) throw Error("Exact expected IDs required");
  const prior=await ctx.db.query("pairTestResetAudits").withIndex("by_operationKey",q=>q.eq("operationKey","remove-test-matches5910/v1")).unique();
  const request=canonical(args);
  if(prior) {if(prior.request!==request) throw Error("Operation already used with different request"); return {alreadyRemoved:true,auditId:prior._id};}
  const s=await snapshot(ctx);
  if(s.fingerprint!==args.expectedFingerprint) throw Error("Preview changed");
  const saved=canonical(s.state);
  if(new TextEncoder().encode(saved).length>700000) throw Error("Snapshot too large");
  const auditId=await ctx.db.insert("pairTestResetAudits",{operationKey:"remove-test-matches5910/v1",request,snapshot:saved,createdAt:Date.now()});
  for(const i of s.state.interests) await ctx.db.patch(i._id,{matchId:undefined,adminStatus:"declined"});
  for(const r of s.state.pointers) await ctx.db.patch(r._id,{activeMatchId:undefined});
  for(const s1 of s.state.shares) await ctx.db.patch(s1._id,{matchId:undefined});
  for(const n of s.state.notifications) await ctx.db.delete(n._id);
  for(const m of s.state.matches) await ctx.db.delete(m._id);
  return {alreadyRemoved:false,auditId};
}});
