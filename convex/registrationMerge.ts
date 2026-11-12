import { internalQuery, internalMutation, type QueryCtx, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { hash } from "fast-sha256";
import schema from "./schema";
import type { Doc, Id, TableNames } from "./_generated/dataModel";

export const MERGE_PAIR = { target: "j576zqk2z0qx3s1acv3q81m6th8g9tm8", source: "j570xgx35s3mm0y69ksx1txjmx847gcz" };
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.entries(value).filter(([, x]) => x !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k,x]) => JSON.stringify(k)+":"+canonical(x)).join(",") + "}";
  return JSON.stringify(value);
}
export function fingerprint(value: unknown) { return Array.from(hash(new TextEncoder().encode(canonical(value))), b=>b.toString(16).padStart(2,"0")).join(""); }
type Pair = { source: Id<"registrations">; target: Id<"registrations"> };
type Row = Doc<TableNames>;
function references(value: unknown, ids: Set<string>): boolean {
  if (typeof value === "string") return [...ids].some(id => value.includes(id)); // includes compound receipt and serialized audit keys
  if (Array.isArray(value)) return value.some(x=>references(x,ids));
  return !!value && typeof value === "object" && Object.values(value).some(x=>references(x,ids));
}
export async function snapshot(ctx: QueryCtx, pair: Pair) {
  // Enumerate the schema itself: a newly introduced referencing table cannot silently escape the guard.
  const all: Record<string, Row[]> = {}; let bytes=0;
  for (const table of Object.keys(schema.tables).sort() as TableNames[]) {
    if (table === "registrationMergeAudits") continue;
    const rows=await ctx.db.query(table).take(5001);
    bytes+=new TextEncoder().encode(canonical(rows)).length;
    if(rows.length>5000 || bytes>10_000_000) throw Error("Merge scan bound exceeded");
    all[table]=rows;
  }
  const ids=new Set<string>([pair.source,pair.target]);
  const selected=new Set<string>(); let changed=true;
  while(changed) { changed=false; for(const rows of Object.values(all)) for(const row of rows) {
    if(!selected.has(row._id) && references(row,ids)) { selected.add(row._id); ids.add(row._id); changed=true; }
  }}
  const state=Object.fromEntries(Object.entries(all).map(([table,rows])=>[table,rows.filter(r=>selected.has(r._id)).sort((a,b)=>a._id.localeCompare(b._id))]));
  // Include immutable payment session keys, legacy receipt keys and source contact dependencies.
  const regs=state.registrations as Doc<"registrations">[];
  for(const r of regs.filter(r=>r._id===pair.source || r._id===pair.target)) {
    if(r.stripeSessionId) ids.add(r.stripeSessionId);
    ids.add(r.email.trim().toLowerCase());
  }
  changed=true;
  while(changed) { changed=false; for(const rows of Object.values(all)) for(const row of rows) {
    if(!selected.has(row._id) && references(row,ids)) { selected.add(row._id);ids.add(row._id);changed=true; }
  }}
  for(const [table,rows] of Object.entries(all)) state[table]=rows.filter(r=>selected.has(r._id)).sort((a,b)=>a._id.localeCompare(b._id));
  return {state,fingerprint:fingerprint(state)};
}
const policyValidator=v.union(v.literal("unresolved"),v.literal("retain_target"),v.literal("require_background_check"));
type Policy="unresolved"|"retain_target"|"require_background_check";
export async function plan(ctx: QueryCtx,pair:Pair,policy:Policy="unresolved") {
  const s=await snapshot(ctx,pair);
  const source=await ctx.db.get(pair.source),target=await ctx.db.get(pair.target);
  if(!source || !target || source.publicApplicantNumber!==79 || target.publicApplicantNumber!==233) throw Error("Configured merge pair unavailable");
  const enrollments=s.state.eventRegistrations as Doc<"eventRegistrations">[];
  const sourceRows=enrollments.filter(e=>e.registrationId===source._id);
  const conflicts=sourceRows.flatMap(e=>{const t=enrollments.find(t=>t.registrationId===target._id&&t.eventId===e.eventId);return t&&t.eligibilityStatus!==e.eligibilityStatus?[{source:e._id,target:t._id,sourceEligibility:e.eligibilityStatus,targetEligibility:t.eligibilityStatus}]:[];});
  const blockers:string[]=[];
  if(enrollments.some(e=>e.supersededBy || e.mergedIntoRegistrationId)) blockers.push("Preexisting enrollment supersession requires review");
  const enrollmentKeys=enrollments.map(e=>e.eventId+"/"+e.registrationId);
  if(new Set(enrollmentKeys).size!==enrollmentKeys.length) blockers.push("Ambiguous enrollment topology");
  const interestRows=s.state.interests as Doc<"interests">[];
  if(interestRows.some(i=>i.femaleWorkflow && (i.femaleWorkflow.state!=="private_documented" || Object.keys(i.femaleWorkflow).some(k=>k!=="state")))) blockers.push("Consent-bearing female workflow cannot be transferred");
  if(interestRows.some(i=>i.senderPhotoConsent!==undefined || i.senderPhotoConsentRevokedAt!==undefined)) blockers.push("Submission photo consent cannot be transferred");
  const openKeys=interestRows.filter(i=>!["withdrawn","declined","closed"].includes(i.status)).map(i=>[i.fromRegistrationId===source._id?target._id:i.fromRegistrationId,i.toRegistrationId===source._id?target._id:i.toRegistrationId,i.eventId].join("/"));
  if(new Set(openKeys).size!==openKeys.length) blockers.push("Duplicate open interests after merge");
  if((s.state.interestFlows as Doc<"interestFlows">[]).some(f=>f.recipientDecision!=="pending" || f.requesterFinalApproval!=="pending" || f.recipientFinalApproval!=="pending" || Object.keys(f).some(k=>!["createdAt","updatedAt"].includes(k) && k.endsWith("At")))) blockers.push("Consent-bearing workflow cannot be transferred");
  const unsentReceipts=(s.state.receiptDeliveries as Doc<"receiptDeliveries">[]).some(r=>r.sentAt===undefined);
  const unsafeEventMail=(s.state.eventRegistrationEmails as Doc<"eventRegistrationEmails">[]).some(r=>r.sentAt===undefined);
  if(unsentReceipts || unsafeEventMail || s.state.profileRejectionNotices.length) blockers.push("Unsettled outbound delivery requires reconciliation before merge");
  if(source.mergedIntoRegistrationId || target.mergedIntoRegistrationId) blockers.push("Already merged identity");
  if(conflicts.length && policy==="unresolved") blockers.push("Eligibility decision unresolved: explicit authorization required");
  if(s.state.matches.length || s.state.profileShares.length || s.state.femaleWorkflowDeliveries.length || s.state.matchmakerNotifications.length) blockers.push("Capability/delivery topology changed; review required");
  if((s.state.interestFlows as Doc<"interestFlows">[]).some(f=>f.flowStatus!=="private_documented" || f.photoDecision!=="pending" || f.bioVisibleAt!==undefined || f.photosVisibleAt!==undefined || f.contactSharedAt!==undefined)) blockers.push("Consent-bearing workflow cannot be transferred");
  const writes:{table:TableNames;id:Id<TableNames>;before:Row;patch:Record<string,unknown>}[]=[];
  const add=(table:TableNames,row:Row,patch:Record<string,unknown>)=>writes.push({table,id:row._id,before:row,patch});
  add("registrations",source,{mergedIntoRegistrationId:target._id,securityRetiredAt:source.securityRetiredAt??Date.now()});
  for(const row of sourceRows) {
    const duplicate=enrollments.find(t=>t.registrationId===target._id&&t.eventId===row.eventId);
    add("eventRegistrations",row,{mergedIntoRegistrationId:target._id,...(duplicate?{supersededBy:duplicate._id}:{})});
    if(duplicate && duplicate.eligibilityStatus!==row.eligibilityStatus && policy==="require_background_check") add("eventRegistrations",duplicate,{eligibilityStatus:"awaiting_background_check"});
  }
  // Preserve all actor IDs, payments, receipt keys, timestamps, source profile and consent.
  // Only unexposed private workflow identities are reassigned. Audit's exact before-image retains provenance.
  for(const table of ["interests","interestFlows"] as const) for(const row of s.state[table] as (Doc<"interests">|Doc<"interestFlows">)[]) {
    const patch:Record<string,unknown>={};
    if(row.fromRegistrationId===source._id) patch.fromRegistrationId=target._id;
    if(row.toRegistrationId===source._id) patch.toRegistrationId=target._id;
    if(Object.keys(patch).length) {
      const from=patch.fromRegistrationId??row.fromRegistrationId,to=patch.toRegistrationId??row.toRegistrationId;
      if(from===to) blockers.push("Self-reference after merge");
      add(table,row,patch);
    }
  }
  if(writes.length>100) blockers.push("Write bound exceeded");
  return {...s,writes,conflicts,blockers,counts:Object.fromEntries(Object.entries(s.state).map(([k,rows])=>[k,rows.length]))};
}
const pair=MERGE_PAIR as Pair;
export const dryRun=internalQuery({args:{policy:v.optional(policyValidator)},handler:async(ctx,args)=>{
  const p=await plan(ctx,pair,args.policy);return {fingerprint:p.fingerprint,counts:p.counts,proposedWrites:p.writes.length,conflicts:p.conflicts,blockers:p.blockers,productionAuthorized:false};
}});
export async function applyMerge(ctx:MutationCtx,pair:Pair,args:{operationKey:string;expectedFingerprint:string;policy:Policy;authorization:string}) {
  if(args.policy==="unresolved" || args.authorization.trim().length<20) throw Error("Explicit eligibility authorization required");
  if(args.operationKey.length<10 || args.operationKey.length>100) throw Error("Invalid operation key");
  const request=canonical({...args,pair});
  const prior=await ctx.db.query("registrationMergeAudits").withIndex("by_operationKey",q=>q.eq("operationKey",args.operationKey)).unique();
  if(prior) {if(prior.request!==request || prior.rolledBackAt!==undefined) throw Error("Operation key conflict");return {auditId:prior._id,alreadyApplied:true};}
  const p=await plan(ctx,pair,args.policy);
  if(p.fingerprint!==args.expectedFingerprint) throw Error("Merge scope drift");
  if(p.blockers.length) throw Error(p.blockers.join("; "));
  const before=canonical(p.writes.map(w=>({table:w.table,row:w.before})));
  if(new TextEncoder().encode(before).length>600000) throw Error("Before-image size bound exceeded");
  for(const w of p.writes) await ctx.db.patch(w.id,w.patch);
  const after=await snapshot(ctx,pair);
  const auditId=await ctx.db.insert("registrationMergeAudits",{operationKey:args.operationKey,request,before,afterFingerprint:after.fingerprint,sourceId:pair.source,targetId:pair.target,createdAt:Date.now()});
  return {auditId,alreadyApplied:false};
}
export const apply=internalMutation({args:{operationKey:v.string(),expectedFingerprint:v.string(),policy:policyValidator,authorization:v.string(),releaseApproved:v.literal(true)},handler:async(ctx,args)=>applyMerge(ctx,pair,args)});
export async function rollbackMerge(ctx:MutationCtx,auditId:Id<"registrationMergeAudits">) {
  const audit=await ctx.db.get(auditId);if(!audit) throw Error("Missing merge audit");
  const pair={source:audit.sourceId,target:audit.targetId};
  const current=await snapshot(ctx,pair);
  if(audit.rolledBackAt!==undefined) {if(current.fingerprint!==audit.rollbackFingerprint) throw Error("Rollback scope drift");return {alreadyRolledBack:true};}
  if(current.fingerprint!==audit.afterFingerprint) throw Error("Rollback scope drift");
  const source=await ctx.db.get(pair.source);
  if(!source?.securityRetiredAt) throw Error("Missing durable security retirement");
  const saved=JSON.parse(audit.before) as {table:TableNames;row:Row}[];
  for(const {row} of saved) {
    const {_id,_creationTime,...value}=row;void _creationTime;
    if(_id===pair.source) Object.assign(value,{securityRetiredAt:source.securityRetiredAt});
    await ctx.db.replace(_id,value);
  }
  await ctx.db.patch(audit._id,{rolledBackAt:Date.now(),rollbackFingerprint:(await snapshot(ctx,pair)).fingerprint});
  return {alreadyRolledBack:false};
}
export const rollback=internalMutation({args:{auditId:v.id("registrationMergeAudits"),releaseApproved:v.literal(true)},handler:async(ctx,args)=>rollbackMerge(ctx,args.auditId)});
