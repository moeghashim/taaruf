import { action, query, mutation, internalMutation, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAdmin } from "./adminAuthorization";
import { canonical, fingerprint } from "./registrationMerge";

export const CONTENT_FIELDS = ["job", "education", "maritalStatus", "ethnicity", "prayerCommitment", "hijabResponse", "spouseRequirement1", "spouseRequirement2", "spouseRequirement3", "shareableBio", "describeYourself", "lookingFor"] as const;
const pairArgs = { sourceId: v.id("registrations"), targetId: v.id("registrations"), sourceNumber: v.number(), targetNumber: v.number() };
const applyArgs = { ...pairArgs, operationKey: v.string(), expectedFingerprint: v.string() };
type Pair = {sourceId: Id<"registrations">; targetId: Id<"registrations">; sourceNumber: number; targetNumber: number};

// Conservatively block replacement under historical recipient grants. No relationships
// are revoked or rewritten to make a copy possible. Source references remain untouched.
async function noTargetExposure(ctx: QueryCtx, id: Id<"registrations">) {
  const refs = await Promise.all([
    ctx.db.query("interests").withIndex("by_fromRegistrationId", q=>q.eq("fromRegistrationId",id)).first(),
    ctx.db.query("interests").withIndex("by_toRegistrationId", q=>q.eq("toRegistrationId",id)).first(),
    ctx.db.query("matches").withIndex("by_maleRegistrationId", q=>q.eq("maleRegistrationId",id)).first(),
    ctx.db.query("matches").withIndex("by_femaleRegistrationId", q=>q.eq("femaleRegistrationId",id)).first(),
    ctx.db.query("profileShares").withIndex("by_ownerRegistrationId", q=>q.eq("ownerRegistrationId",id)).first(),
    ctx.db.query("profileShares").withIndex("by_recipientRegistrationId", q=>q.eq("recipientRegistrationId",id)).first(),
    ctx.db.query("interestFlows").withIndex("by_fromRegistrationId_and_flowStatus", q=>q.eq("fromRegistrationId",id)).first(),
    ctx.db.query("interestFlows").withIndex("by_toRegistrationId_and_flowStatus", q=>q.eq("toRegistrationId",id)).first(),
  ]);
  if(refs.some(Boolean)) throw Error("Target relationship references require separate disclosure review");
}
async function imageEvidence(ctx: QueryCtx, row: Doc<"registrations">) {
  const registrations = await ctx.db.query("registrations").take(5001);
  if (registrations.length > 5000) throw Error("Photo reference scan bound exceeded");
  const evidence=[];
  for(const id of row.imageStorageIds ?? []) {
    if (registrations.some(other => other._id !== row._id && other.imageStorageIds?.includes(id))) throw Error("Ambiguous shared photo ownership");
    const ledger=await ctx.db.query("photoUploads").withIndex("by_storageId",q=>q.eq("storageId",id)).unique();
    if(ledger && ledger.registrationId!==row._id) throw Error("Image ownership mismatch");
    const meta=await ctx.db.system.get(id);
    if(!meta || meta.size>10_000_000 || (meta.contentType !== undefined && !meta.contentType.startsWith("image/"))) throw Error("Invalid source or original image");
    // Existing attachment is acceptable legacy evidence only; never claim another ledger.
    evidence.push({id,ledger,meta});
  }
  return evidence;
}
async function plan(ctx: QueryCtx, pair: Pair) {
  if(pair.sourceId===pair.targetId) throw Error("Distinct profiles required");
  const source=await ctx.db.get(pair.sourceId),target=await ctx.db.get(pair.targetId);
  if(!source || !target) throw Error("Profile not found");
  if(source.publicApplicantNumber!==pair.sourceNumber || target.publicApplicantNumber!==pair.targetNumber) throw Error("Applicant confirmation mismatch");
  if([source,target].some(r=>r.archivedAt!==undefined || r.securityRetiredAt!==undefined || r.mergedIntoRegistrationId!==undefined)) throw Error("Inactive identity");
  if(source.photoSharingPermission!==target.photoSharingPermission) throw Error("Photo privacy differs; explicit review required");
  if((source.imageStorageIds?.length??0)<1 || source.imageStorageIds!.length>3 || new Set(source.imageStorageIds).size!==source.imageStorageIds!.length) throw Error("Source requires one to three distinct photos");
  await noTargetExposure(ctx,target._id);
  const images=await imageEvidence(ctx,source), originals=await imageEvidence(ctx,target);
  const patch=Object.fromEntries(CONTENT_FIELDS.filter(k=>source[k]!==undefined).map(k=>[k,source[k]])) as Partial<Doc<"registrations">>;
  const changedFields=CONTENT_FIELDS.filter(k=>source[k]!==undefined && source[k]!==target[k]) as string[];
  changedFields.push("imageStorageIds");
  return {source,target,images,originals,patch,changedFields,fingerprint:fingerprint({source,target,images,originals})};
}
export const preview=query({args:{...pairArgs,adminSecret:v.string()},handler:async(ctx,args)=>{
  requireAdmin(args.adminSecret);const p=await plan(ctx,args);
  return {fingerprint:p.fingerprint,changedFields:p.changedFields,photoCount:p.images.length};
}});
export const prepare=internalMutation({args:applyArgs,handler:async(ctx,args)=>{
  if(args.operationKey.length<10 || args.operationKey.length>100) throw Error("Invalid operation key");
  const request=canonical(args);
  const prior=await ctx.db.query("profileContentCopyAudits").withIndex("by_operationKey",q=>q.eq("operationKey",args.operationKey)).unique();
  if(prior) {
    if(prior.request!==request || prior.state==="rolled_back") throw Error("Operation key conflict");
    return {auditId:prior._id,state:prior.state,sourceStorageIds:[] as Id<"_storage">[],changedFields:prior.changedFields};
  }
  const p=await plan(ctx,args);
  if(p.fingerprint!==args.expectedFingerprint) throw Error("Profile scope drift");
  const beforeTarget=canonical(p.target);
  if(beforeTarget.length>200000) throw Error("Backup bound exceeded");
  const auditId=await ctx.db.insert("profileContentCopyAudits",{...args,request,beforeTarget,sourceFingerprint:fingerprint(p.source),copiedStorageIds:[],changedFields:p.changedFields,state:"prepared",createdAt:Date.now()});
  return {auditId,state:"new" as const,sourceStorageIds:p.source.imageStorageIds!,changedFields:p.changedFields};
}});
// Each completed clone receives a durable receipt. Process death between store and
// receipt may leave an unattached orphan: never delete originals or retry blindly.
export const recordClone=internalMutation({args:{auditId:v.id("profileContentCopyAudits"),storageId:v.id("_storage"),index:v.number()},handler:async(ctx,args)=>{
  const a=await ctx.db.get(args.auditId);if(!a || a.state!=="prepared") throw Error("Copy not prepared");
  const p=await plan(ctx,a);if(p.fingerprint!==a.expectedFingerprint) throw Error("Profile scope drift");
  if(args.index!==a.copiedStorageIds.length || args.index>=p.images.length) throw Error("Clone order mismatch");
  const meta=await ctx.db.system.get(args.storageId);
  if(!meta || meta.sha256!==p.images[args.index].meta.sha256 || p.images.some(x=>x.id===args.storageId) || p.originals.some(x=>x.id===args.storageId)) throw Error("Copied photo provenance mismatch");
  await ctx.db.patch(a._id,{copiedStorageIds:[...a.copiedStorageIds,args.storageId]});
}});
export const status=query({args:{adminSecret:v.string(),operationKey:v.string()},handler:async(ctx,args)=>{
  requireAdmin(args.adminSecret);
  const a=await ctx.db.query("profileContentCopyAudits").withIndex("by_operationKey",q=>q.eq("operationKey",args.operationKey)).unique();
  return a ? {auditId:a._id,state:a.state,stagedPhotoCount:a.copiedStorageIds.length,changedFields:a.changedFields,recoveryRequired:a.state==="prepared"} : null;
}});
export const finish=internalMutation({args:{auditId:v.id("profileContentCopyAudits"),copiedStorageIds:v.array(v.id("_storage"))},handler:async(ctx,args)=>{
  const a=await ctx.db.get(args.auditId);if(!a || a.state!=="prepared") throw Error("Copy not prepared");
  const p=await plan(ctx,a);
  if(p.fingerprint!==a.expectedFingerprint) throw Error("Profile scope drift");
  if(args.copiedStorageIds.length!==p.images.length || new Set(args.copiedStorageIds).size!==p.images.length) throw Error("Invalid copied photos");
  for(const [i,id] of args.copiedStorageIds.entries()) {
    const meta=await ctx.db.system.get(id);
    const ledger=await ctx.db.query("photoUploads").withIndex("by_storageId",q=>q.eq("storageId",id)).unique();
    if(ledger || p.images.some(x=>x.id===id) || p.originals.some(x=>x.id===id) || !meta || meta.sha256!==p.images[i].meta.sha256 || meta.contentType!==p.images[i].meta.contentType) throw Error("Copied photo provenance mismatch");
    await ctx.db.insert("photoUploads",{storageId:id,registrationId:a.targetId,createdAt:Date.now()});
  }
  for(const old of p.originals) if(!old.ledger) await ctx.db.insert("photoUploads",{storageId:old.id,registrationId:a.targetId,createdAt:Date.now()});
  const patch={...p.patch,imageStorageIds:args.copiedStorageIds};
  await ctx.db.patch(a.targetId,patch);
  await ctx.db.patch(a._id,{state:"applied",copiedStorageIds:args.copiedStorageIds,afterFingerprint:fingerprint({...p.target,...patch})});
  return {auditId:a._id,alreadyApplied:false,changedFields:a.changedFields};
}});
type Result={auditId:Id<"profileContentCopyAudits">;alreadyApplied:boolean;changedFields:string[]};
export const apply=action({args:{...applyArgs,adminSecret:v.string()},handler:async(ctx,args):Promise<Result>=>{
  requireAdmin(args.adminSecret);
  const {adminSecret,...request}=args;void adminSecret;
  const prep=await ctx.runMutation(internal.profileContentCopy.prepare,request);
  if(prep.state==="applied") return {auditId:prep.auditId,alreadyApplied:true,changedFields:prep.changedFields};
  // Duplicate in-flight calls cannot both write. Interrupted preparations need explicit
  // operator reconciliation; no automatic retry allocates more files or changes data.
  if(prep.state!=="new") throw Error("Copy already prepared; reconcile interrupted operation");
  const copiedStorageIds:Id<"_storage">[]=[];
  for(const id of prep.sourceStorageIds) {
    const blob=await ctx.storage.get(id);if(!blob || blob.size>10_000_000 || !blob.type.startsWith("image/")) throw Error("Source image unavailable");
    const storageId=await ctx.storage.store(blob);
    await ctx.runMutation(internal.profileContentCopy.recordClone,{auditId:prep.auditId,storageId,index:copiedStorageIds.length});
    copiedStorageIds.push(storageId);
  }
  // Storage writes are intentionally never deleted on failure: originals and retained
  // copies remain available for forensic recovery; only finish attaches target photos.
  return await ctx.runMutation(internal.profileContentCopy.finish,{auditId:prep.auditId,copiedStorageIds});
}});
export const rollback=mutation({args:{adminSecret:v.string(),auditId:v.id("profileContentCopyAudits")},handler:async(ctx,args)=>{
  requireAdmin(args.adminSecret);const a=await ctx.db.get(args.auditId);if(!a) throw Error("Missing audit");
  const target=await ctx.db.get(a.targetId),source=await ctx.db.get(a.sourceId);
  if(!target || !source || fingerprint(source)!==a.sourceFingerprint) throw Error("Rollback scope drift");
  await noTargetExposure(ctx,a.targetId);
  if(a.state==="rolled_back") {
    if(canonical(target)!==a.beforeTarget) throw Error("Rollback scope drift");
    return {alreadyRolledBack:true};
  }
  if(a.state!=="applied" || fingerprint(target)!==a.afterFingerprint) throw Error("Rollback scope drift");
  const before=JSON.parse(a.beforeTarget) as Doc<"registrations">;
  const patch:Partial<Doc<"registrations">>={imageStorageIds:before.imageStorageIds};
  for(const k of CONTENT_FIELDS) Object.assign(patch,{[k]:before[k]});
  await ctx.db.patch(target._id,patch);
  await ctx.db.patch(a._id,{state:"rolled_back",rolledBackAt:Date.now()});
  return {alreadyRolledBack:false};
}});
