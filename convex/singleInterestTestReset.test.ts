import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import type { Id, TableNames } from "./_generated/dataModel";

async function fixture() {
  const t = convexTest(schema, modules);
  const data = await t.run(async ctx => {
    const regs: Id<"registrations">[] = [];
    for (const gender of ["female", "male", "male"] as const) regs.push(await ctx.db.insert("registrations", { name: "Synthetic " + regs.length, gender, age: 30, maritalStatus: "single", education: "College", job: "Engineer", email: regs.length + "@example.invalid", phone: "555-0100", paymentStatus: "paid", status: "approved", profileCompletionStatus: "completed", searchStatus: "active", publicApplicantNumber: regs.length + 1, createdAt: 1 }));
    const [a,b,other] = regs;
    const eventId = await ctx.db.insert("events", { title: "Synthetic", eventCode: "synthetic", eventMonth: "2026-11", series: "1plus1_match", location: "Test", startsAt: 1, endsAt: 2, status: "completed", maleCapacity: 10, femaleCapacity: 10, interestSubmissionsEnabled: true, createdAt: 1, updatedAt: 1 });
    for (const registrationId of regs) {
      await ctx.db.insert("eventRegistrations", { eventId, registrationId, gender: registrationId === a ? "female" : "male", registrationStatus: "approved", confirmationStatus: "confirmed", attendanceStatus: "attended", eligibilityStatus: "approved_member", checkedInAt: 1, createdAt: 1, updatedAt: 1 });
      await ctx.db.insert("eventAttendees", { eventId, registrationId, addedAt: 1 });
      await ctx.db.insert("applicantSessions", { registrationId, sessionHash: "session-" + registrationId, expiresAt: Date.now() + 3600000, createdAt: 1 });
    }
    const old: Id<"interests">[] = [], orphans: Id<"interestFlows">[] = [];
    const insert = async (fromRegistrationId: Id<"registrations">, toRegistrationId: Id<"registrations">, historical: boolean) => {
      const interestId = await ctx.db.insert("interests", { fromRegistrationId, toRegistrationId, eventId, source: "platform_submission", status: historical ? "closed" : "new", visibility: "internal_only", adminStatus: "pending", ...(historical ? {testReset: {at: 2, reason: "old synthetic reset", actor: "admin" as const}} : {}), createdAt: 1, updatedAt: 2 });
      const interestFlowId = await ctx.db.insert("interestFlows", { interestId, fromRegistrationId, toRegistrationId, flowStatus: historical ? "closed" : "private_documented", recipientDecision: "pending", requesterFinalApproval: "pending", recipientFinalApproval: "pending", photoDecision: "pending", createdAt: 1, updatedAt: 2 });
      await ctx.db.insert("interestFlowEvents", { interestId, interestFlowId, actor: "admin", eventType: historical ? "contacts_disclosed_in_portal" : "interest_number_submitted", createdAt: 1 });
      return { interestId, interestFlowId };
    };
    for (let i=0;i<4;i++) {
      const {interestId} = await insert(i%2 ? b:a, i%2 ? a:b, true); old.push(interestId);
      await ctx.db.insert("profileShares", { ownerRegistrationId:a, recipientRegistrationId:b, interestId, shareToken:"revoked-"+i, status:"closed", revokedAt:2, includeImages:false, createdAt:1, updatedAt:2 });
    }
    for (let i=0;i<7;i++) {
      const row = await insert(a,b,true);
      await ctx.db.delete(row.interestId);
      await ctx.db.patch(row.interestFlowId, {bioVisibleAt: 1, requesterFinalApproval:"approved", recipientFinalApproval:"approved", flowStatus:i%2 ? "declined":"closed"});
      orphans.push(row.interestFlowId);
    }
    const target = await insert(a,b,false);
    await ctx.db.insert("interestFlowEvents", {interestId:target.interestId,interestFlowId:target.interestFlowId,actor:"system",eventType:"flow_created",createdAt:1});
    const unrelated = await insert(a,other,false);
    await ctx.db.insert("settings", {key:"sentinel",value:"unchanged"});
    await ctx.db.insert("pairTestResetAudits", {operationKey:"old-audit",request:"old request",snapshot:"old snapshot",createdAt:1});
    return {scope:{interestId:target.interestId,eventId,fromRegistrationId:a,toRegistrationId:b}, flowId:target.interestFlowId, old, orphans, other, unrelated};
  });
  const pre = await t.query(internal.singleInterestTestReset.preflight, data.scope);
  const args = {...data.scope, expectedFingerprint:pre.fingerprint, operationKey:"single-synthetic-operation",reason:"Owner approved synthetic test only",confirmTest:true as const};
  return {t,...data,pre,args};
}
async function all(t: ReturnType<typeof convexTest>) {
  return t.run(async ctx => {
    const result: Record<string, unknown[]> = {};
    for (const table of Object.keys(schema.tables) as TableNames[]) result[table] = await ctx.db.query(table).collect();
    result._scheduled_functions = await ctx.db.system.query("_scheduled_functions").collect();
    return result;
  });
}
test("one target only; four old resets, seven inert bio orphans, four revoked shares and every other table preserved", async () => {
  const f=await fixture(); const before=await all(f.t);
  expect(f.pre.state.interests).toHaveLength(5); expect(f.pre.state.orphanFlows).toHaveLength(7);
  const result=await f.t.mutation(internal.singleInterestTestReset.reset,f.args);
  const after=await all(f.t);
  const changed = new Set([f.scope.interestId,f.flowId]);
  for (const table of Object.keys(before)) {
    if (["pairTestResetAudits","interestFlowEvents"].includes(table)) {
      expect(after[table].slice(0,-1)).toEqual(before[table]); expect(after[table]).toHaveLength(before[table].length+1);
    } else {
      const omit = (rows: unknown[]) => rows.filter(r => !changed.has((r as {_id: Id<"interests">})._id));
      expect(omit(after[table])).toEqual(omit(before[table]));
    }
  }
  const target=await f.t.run(ctx=>ctx.db.get(f.scope.interestId));
  expect(target).toEqual({...f.pre.state.target,status:"closed",adminStatus:"pending",updatedAt:expect.any(Number),testReset:{at:expect.any(Number),actor:"admin",reason:f.args.reason}});
  expect(await f.t.run(ctx=>ctx.db.get(f.flowId))).toEqual({...f.pre.state.targetFlow,flowStatus:"closed",closedReason:"admin_test_reset",updatedAt:expect.any(Number)});
  expect((await f.t.run(ctx=>ctx.db.get(result.auditId)))!.snapshot).toBe(f.pre.fingerprint);
  expect(await f.t.mutation(internal.singleInterestTestReset.reset,f.args)).toEqual({...result,alreadyReset:true});
  expect(await all(f.t)).toEqual(after);
  await expect(f.t.mutation(internal.singleInterestTestReset.reset,{...f.args,reason:"different synthetic reason"})).rejects.toThrow("reused");
  await expect(f.t.mutation(internal.singleInterestTestReset.reset,{...f.args,operationKey:"different-operation"})).rejects.toThrow();
});
test("exactly one quota slot restored and stale actions cannot revive target or orphan",async()=>{
  const f=await fixture(); const sessionHash="session-"+f.scope.fromRegistrationId;
  const before=await f.t.query(api.applicantInterests.getInterestEligibility,{sessionHash});
  await f.t.mutation(internal.singleInterestTestReset.reset,f.args);
  const after=await f.t.query(api.applicantInterests.getInterestEligibility,{sessionHash});
  expect(before.interestSubmissions).toHaveLength(2); expect(after.interestSubmissions).toHaveLength(1);
  expect(after.interestSubmissions[0].interestId).toBe(f.unrelated.interestId);
  for(const interestId of [f.scope.interestId,...f.pre.state.orphanFlows.map(f=>f.interestId)]) {
    await expect(f.t.mutation(api.applicantInterests.withdrawOutbound,{sessionHash,interestId})).rejects.toThrow();
    await expect(f.t.mutation(api.applicantInterests.giveFinalApproval,{sessionHash,interestId,approved:true})).rejects.toThrow();
  }
  await expect(f.t.mutation(api.interests.convertToMatch,{interestId:f.scope.interestId})).rejects.toThrow();
  await expect(f.t.mutation(api.profileShares.create,{ownerRegistrationId:f.scope.fromRegistrationId,recipientRegistrationId:f.scope.toRegistrationId,interestId:f.scope.interestId,shareToken:"stale",includeImages:false})).rejects.toThrow();
});
for (const kind of ["profileDrift","oldAuditDrift","orphanBioDrift","historyDrift","contact","photo","approval","action","liveOld","oldNotReset","missingFlow","duplicateFlow","foreignFlow","foreignHistory","foreignActor","share","revokedTargetShare","foreignShare","match","foreignMatch","pointer","missingRegistration","missingEvent","wrongTarget","wrongDirection","wrongEvent"] as const) test("atomic fail closed: "+kind,async()=>{
  const f=await fixture();
  await f.t.run(async ctx=>{
    if(kind==="profileDrift") await ctx.db.patch(f.scope.fromRegistrationId,{phone:"changed"});
    if(kind==="oldAuditDrift") {const r=await ctx.db.query("pairTestResetAudits").first();await ctx.db.patch(r!._id,{snapshot:"changed"});}
    if(kind==="orphanBioDrift") await ctx.db.patch(f.orphans[0],{bioVisibleAt:9});
    if(kind==="historyDrift") {const r=await ctx.db.query("interestFlowEvents").first();await ctx.db.patch(r!._id,{message:"changed"});}
    if(kind==="contact") await ctx.db.patch(f.flowId,{contactSharedAt:0});
    if(kind==="photo") await ctx.db.patch(f.flowId,{photoDecision:"approved"});
    if(kind==="approval") await ctx.db.patch(f.flowId,{requesterFinalApproval:"approved"});
    if(kind==="action") await ctx.db.insert("interestFlowEvents",{interestId:f.scope.interestId,interestFlowId:f.flowId,actor:"system",eventType:"contacts_disclosed_in_portal",createdAt:1});
    if(kind==="liveOld") await ctx.db.patch(f.old[0],{status:"new"});
    if(kind==="oldNotReset") await ctx.db.patch(f.old[0],{testReset:undefined});
    if(kind==="missingFlow") await ctx.db.delete(f.flowId);
    if(kind==="duplicateFlow") {const {_id,_creationTime,...row}=f.pre.state.targetFlow;void _id;void _creationTime;await ctx.db.insert("interestFlows",row);}
    if(kind==="foreignFlow") await ctx.db.patch(f.flowId,{toRegistrationId:f.other});
    if(kind==="foreignHistory"||kind==="foreignActor") await ctx.db.insert("interestFlowEvents",{interestId:kind==="foreignHistory"?f.unrelated.interestId:f.scope.interestId,interestFlowId:f.flowId,actor:"applicant",actorRegistrationId:f.other,eventType:"interest_number_submitted",createdAt:1});
    if(["share","revokedTargetShare","foreignShare"].includes(kind)) await ctx.db.insert("profileShares",{ownerRegistrationId:f.scope.fromRegistrationId,recipientRegistrationId:kind==="foreignShare"?f.other:f.scope.toRegistrationId,interestId:f.scope.interestId,shareToken:"unsafe",includeImages:false,status:kind==="revokedTargetShare"?"closed":"shared",revokedAt:kind==="revokedTargetShare"?2:undefined,createdAt:1,updatedAt:1});
    if(kind==="match"||kind==="foreignMatch"||kind==="pointer") {const id=await ctx.db.insert("matches",{maleRegistrationId:kind==="foreignMatch"?f.other:f.scope.toRegistrationId,femaleRegistrationId:f.scope.fromRegistrationId,interestId:f.scope.interestId,interestType:"mutual_interest",status:"closed",createdAt:1,updatedAt:1});if(kind==="pointer")await ctx.db.patch(f.scope.fromRegistrationId,{activeMatchId:id});}
    if(kind==="missingRegistration") await ctx.db.delete(f.scope.toRegistrationId);
    if(kind==="missingEvent") await ctx.db.delete(f.scope.eventId);
    if(kind==="wrongEvent") {const {_id,_creationTime,...row}=f.pre.state.events[0];void _id;void _creationTime;f.args.eventId=await ctx.db.insert("events",row);}
  });
  if(kind==="wrongTarget") f.args.interestId=f.unrelated.interestId;
  if(kind==="wrongDirection") [f.args.fromRegistrationId,f.args.toRegistrationId]=[f.args.toRegistrationId,f.args.fromRegistrationId];
  const before=await all(f.t);
  await expect(f.t.mutation(internal.singleInterestTestReset.reset,f.args)).rejects.toThrow();
  expect(await all(f.t)).toEqual(before);
});


// Independent regression review of the narrowly authorized two-grant revocation.
async function shareFixture() {
  const f = await fixture();
  const shareIds = await f.t.run(async ctx => {
    const ids: Id<"profileShares">[] = [];
    for (const status of ["shared", "viewed"] as const) ids.push(await ctx.db.insert("profileShares", {
      ownerRegistrationId:f.scope.fromRegistrationId, recipientRegistrationId:f.scope.toRegistrationId,
      shareToken:"synthetic-live-"+status, includeImages:true, status, createdAt:1, updatedAt:1,
    }));
    await ctx.db.insert("profileShares", {ownerRegistrationId:f.other,recipientRegistrationId:f.scope.fromRegistrationId,shareToken:"foreign-sentinel",includeImages:true,status:"shared",createdAt:1,updatedAt:1});
    return ids;
  });
  const shareScope = {ownerRegistrationId:f.scope.fromRegistrationId,recipientRegistrationId:f.scope.toRegistrationId,shareIds};
  const sharePre = await f.t.query(internal.singleInterestTestReset.preflightShares,shareScope);
  const shareArgs = {...shareScope,expectedFingerprint:sharePre.fingerprint,operationKey:"synthetic-two-grant-revoke",reason:"Explicit owner approval for exact two synthetic photo grants",confirmTest:true as const};
  return {...f,shareScope,sharePre,shareArgs};
}
test("two-grant revocation preserves every other row/table, denies bearer lookup, audits once and unlocks fresh single reset",async()=>{
  const f=await shareFixture();
  await expect(f.t.query(internal.singleInterestTestReset.preflight,f.scope)).rejects.toThrow("share");
  const before=await all(f.t);
  const result=await f.t.mutation(internal.singleInterestTestReset.revokeShares,f.shareArgs);
  const after=await all(f.t);
  for(const table of Object.keys(before)) {
    if(table==="pairTestResetAudits") {expect(after[table].slice(0,-1)).toEqual(before[table]);expect(after[table]).toHaveLength(before[table].length+1);}
    else if(table==="profileShares") {
      const omit=(rows:unknown[])=>rows.filter(r=>!f.shareScope.shareIds.includes((r as {_id:Id<"profileShares">})._id));
      expect(omit(after[table])).toEqual(omit(before[table]));expect(after[table]).toHaveLength(before[table].length);
    } else expect(after[table]).toEqual(before[table]);
  }
  for(const share of f.sharePre.state.shares) {
    const row=await f.t.run(ctx=>ctx.db.get(share!._id));
    expect(row).toEqual({...share,status:"closed",includeImages:false,revokedAt:expect.any(Number),updatedAt:expect.any(Number)});
    expect(row!.revokedAt).toBe(row!.updatedAt);
    // Lookup only: never retrieve image URLs or storage blobs.
    expect(await f.t.query(api.profileShares.getByShareToken,{shareToken:share!.shareToken})).toBeNull();
    await expect(f.t.mutation(api.profileShares.markViewed,{shareToken:share!.shareToken})).rejects.toThrow();
  }
  const audit=await f.t.run(ctx=>ctx.db.get(result.auditId));
  expect(audit!.snapshot).toBe(f.sharePre.fingerprint);
  expect(JSON.parse(audit!.request)).toEqual({helper:"singleInterestTestReset/revokeShares/v1",...f.shareArgs});
  expect(await f.t.mutation(internal.singleInterestTestReset.revokeShares,f.shareArgs)).toEqual({...result,alreadyRevoked:true});
  expect(await all(f.t)).toEqual(after);
  await expect(f.t.mutation(internal.singleInterestTestReset.revokeShares,{...f.shareArgs,reason:"Changed authorization reason"})).rejects.toThrow("reused");
  await expect(f.t.mutation(internal.singleInterestTestReset.reset,f.args)).rejects.toThrow("drift");
  const fresh=await f.t.query(internal.singleInterestTestReset.preflight,f.scope);
  await f.t.mutation(internal.singleInterestTestReset.reset,{...f.args,expectedFingerprint:fresh.fingerprint});
});
for(const kind of ["shareDrift","ownerDrift","recipientDrift","foreignOwner","foreignRecipient","reversedDirection","linkedInterest","linkedMatch","revokedZero","closed","missingShare","missingOwner","duplicateIDs","oneID","threeIDs","sameParticipant","wrongFingerprint","keyCollision","duplicateAuditKeys"] as const) test("two-grant atomic rejection: "+kind,async()=>{
  const f=await shareFixture();
  await f.t.run(async ctx=>{
    const id=f.shareScope.shareIds[0];
    if(kind==="shareDrift")await ctx.db.patch(id,{shareToken:"changed-token"});
    if(kind==="ownerDrift")await ctx.db.patch(f.shareScope.ownerRegistrationId,{name:"Changed owner"});
    if(kind==="recipientDrift")await ctx.db.patch(f.shareScope.recipientRegistrationId,{name:"Changed recipient"});
    if(kind==="foreignOwner")await ctx.db.patch(id,{ownerRegistrationId:f.other});
    if(kind==="foreignRecipient")await ctx.db.patch(id,{recipientRegistrationId:f.other});
    if(kind==="linkedInterest")await ctx.db.patch(id,{interestId:f.scope.interestId});
    if(kind==="linkedMatch") {const matchId=await ctx.db.insert("matches",{maleRegistrationId:f.scope.toRegistrationId,femaleRegistrationId:f.scope.fromRegistrationId,interestType:"mutual_interest",status:"closed",createdAt:1,updatedAt:1});await ctx.db.patch(id,{matchId});}
    if(kind==="revokedZero")await ctx.db.patch(id,{revokedAt:0});
    if(kind==="closed")await ctx.db.patch(id,{status:"closed"});
    if(kind==="missingShare")await ctx.db.delete(id);
    if(kind==="missingOwner")await ctx.db.delete(f.shareScope.ownerRegistrationId);
    if(kind==="keyCollision"||kind==="duplicateAuditKeys") {
      await ctx.db.insert("pairTestResetAudits",{operationKey:f.shareArgs.operationKey,request:"different request",snapshot:"prior",createdAt:1});
      if(kind==="duplicateAuditKeys")await ctx.db.insert("pairTestResetAudits",{operationKey:f.shareArgs.operationKey,request:"different request",snapshot:"prior",createdAt:1});
    }
  });
  if(kind==="duplicateIDs")f.shareArgs.shareIds=[f.shareScope.shareIds[0],f.shareScope.shareIds[0]];
  if(kind==="oneID")f.shareArgs.shareIds=f.shareScope.shareIds.slice(0,1);
  if(kind==="threeIDs")f.shareArgs.shareIds=[...f.shareScope.shareIds,f.shareScope.shareIds[0]];
  if(kind==="sameParticipant")f.shareArgs.recipientRegistrationId=f.shareArgs.ownerRegistrationId;
  if(kind==="reversedDirection")[f.shareArgs.ownerRegistrationId,f.shareArgs.recipientRegistrationId]=[f.shareArgs.recipientRegistrationId,f.shareArgs.ownerRegistrationId];
  if(kind==="wrongFingerprint")f.shareArgs.expectedFingerprint="not the approved snapshot";
  const before=await all(f.t);
  await expect(f.t.mutation(internal.singleInterestTestReset.revokeShares,f.shareArgs)).rejects.toThrow();
  expect(await all(f.t)).toEqual(before);
});


async function closedFixture() {
  const f=await fixture();
  await f.t.run(async ctx=>{
    await ctx.db.patch(f.unrelated.interestId,{status:"closed",testReset:{at:2,actor:"admin",reason:"unrelated sentinel"}});
    await ctx.db.patch(f.scope.interestId,{status:"closed",adminStatus:"declined",visibility:"admin_actionable"});
    await ctx.db.patch(f.flowId,{flowStatus:"closed",closedReason:"admin_reset_pair",recipientDecision:"accepted",bioVisibleAt:3,requesterFinalApproval:"approved",recipientFinalApproval:"approved",requesterFinalApprovalAt:4,recipientFinalApprovalAt:5});
    for(const [index,eventType] of ["inbound_accepted","final_approval_given","final_approval_given","contact_shared","pair_reset"].entries()) await ctx.db.insert("interestFlowEvents",{interestId:f.scope.interestId,interestFlowId:f.flowId,actor:"admin",eventType,createdAt:3+index});
  });
  const scope={...f.scope,mode:"closed_history" as const};
  const pre=await f.t.query(internal.singleInterestTestReset.preflight,scope);
  return {...f,scope,pre,args:{...f.args,...scope,expectedFingerprint:pre.fingerprint}};
}
test("closed history restores sole slot without rewriting prior disclosure, profiles, check-ins or legacy rows",async()=>{
  const f=await closedFixture(); const before=await all(f.t);
  const sessionHash="session-"+f.scope.fromRegistrationId;
  expect((await f.t.query(api.applicantInterests.getInterestEligibility,{sessionHash})).interestSubmissions).toHaveLength(1);
  expect(JSON.parse(f.pre.fingerprint).mode).toBe("closed_history");
  const result=await f.t.mutation(internal.singleInterestTestReset.reset,f.args);
  const after=await all(f.t);
  expect((await f.t.query(api.applicantInterests.getInterestEligibility,{sessionHash})).interestSubmissions).toHaveLength(0);
  for(const table of Object.keys(before)) {
    if(["pairTestResetAudits","interestFlowEvents"].includes(table)) {
      expect(after[table].slice(0,-1)).toEqual(before[table]); expect(after[table]).toHaveLength(before[table].length+1);
    } else {
      const omit=(rows:unknown[])=>rows.filter(r=>![f.scope.interestId,f.flowId].includes((r as {_id:Id<"interests">})._id));
      expect(omit(after[table])).toEqual(omit(before[table]));
    }
  }
  expect(await f.t.run(ctx=>ctx.db.get(f.scope.interestId))).toEqual({...f.pre.state.target,status:"closed",adminStatus:"pending",testReset:{at:expect.any(Number),actor:"admin",reason:f.args.reason},updatedAt:expect.any(Number)});
  const {bioVisibleAt,requesterFinalApprovalAt,recipientFinalApprovalAt,...retained}=f.pre.state.targetFlow;
  void bioVisibleAt;void requesterFinalApprovalAt;void recipientFinalApprovalAt;
  expect(await f.t.run(ctx=>ctx.db.get(f.flowId))).toEqual({...retained,closedReason:"admin_test_reset",recipientDecision:"pending",requesterFinalApproval:"pending",recipientFinalApproval:"pending",updatedAt:expect.any(Number)});
  expect(after.interestFlowEvents.at(-1)).toMatchObject({message:expect.stringContaining("does not erase previously shared contact knowledge")});
  const audit=await f.t.run(ctx=>ctx.db.get(result.auditId));
  expect(JSON.parse(audit!.request)).toEqual({helper:"singleInterestTestReset/v1",...f.args});
  expect(audit!.snapshot).toBe(f.pre.fingerprint);
  expect(await f.t.mutation(internal.singleInterestTestReset.reset,f.args)).toEqual({...result,alreadyReset:true});
  await expect(f.t.mutation(internal.singleInterestTestReset.reset,{...f.args,mode:undefined})).rejects.toThrow("reused");
  await expect(f.t.mutation(internal.singleInterestTestReset.reset,{...f.args,interestId:f.unrelated.interestId})).rejects.toThrow("reused");
  expect(await all(f.t)).toEqual(after);
});
for(const kind of ["defaultMode","newTarget","openFlow","wrongClosure","noPairReset","unknownEvent","foreignActor","foreignFlow","foreignHistory","contact","photos","photoApproval","photoRequest","share","revokedTargetShare","foreignShare","match","foreignMatch","liveOld","oldNotReset","oldApproval","profileDrift","historyDrift","wrongFingerprint"] as const) test("closed history rejects atomically: "+kind,async()=>{
  const f=await closedFixture();
  await f.t.run(async ctx=>{
    if(kind==="newTarget")await ctx.db.patch(f.scope.interestId,{status:"new"});
    if(kind==="openFlow")await ctx.db.patch(f.flowId,{flowStatus:"contact_shared"});
    if(kind==="wrongClosure")await ctx.db.patch(f.flowId,{closedReason:"other"});
    if(kind==="noPairReset")for(const e of await ctx.db.query("interestFlowEvents").collect())if(e.interestId===f.scope.interestId&&e.eventType==="pair_reset")await ctx.db.delete(e._id);
    if(["unknownEvent","foreignActor","foreignHistory"].includes(kind))await ctx.db.insert("interestFlowEvents",{interestId:kind==="foreignHistory"?f.unrelated.interestId:f.scope.interestId,interestFlowId:f.flowId,actor:"applicant",actorRegistrationId:kind==="foreignActor"?f.other:f.scope.fromRegistrationId,eventType:kind==="unknownEvent"?"contacts_disclosed_in_portal":"pair_reset",createdAt:9});
    if(kind==="foreignFlow")await ctx.db.patch(f.flowId,{toRegistrationId:f.other});
    if(kind==="contact")await ctx.db.patch(f.flowId,{contactSharedAt:0});
    if(kind==="photos")await ctx.db.patch(f.flowId,{photosVisibleAt:0});
    if(kind==="photoApproval")await ctx.db.patch(f.flowId,{photoDecision:"approved"});
    if(kind==="photoRequest")await ctx.db.patch(f.flowId,{photoRequestedAt:0});
    if(["share","revokedTargetShare","foreignShare"].includes(kind))await ctx.db.insert("profileShares",{ownerRegistrationId:f.scope.fromRegistrationId,recipientRegistrationId:kind==="foreignShare"?f.other:f.scope.toRegistrationId,interestId:f.scope.interestId,shareToken:"unsafe",includeImages:false,status:kind==="revokedTargetShare"?"closed":"shared",revokedAt:kind==="revokedTargetShare"?2:undefined,createdAt:1,updatedAt:1});
    if(kind==="match"||kind==="foreignMatch")await ctx.db.insert("matches",{maleRegistrationId:kind==="foreignMatch"?f.other:f.scope.toRegistrationId,femaleRegistrationId:f.scope.fromRegistrationId,interestId:f.scope.interestId,interestType:"mutual_interest",status:"contact_shared",createdAt:1,updatedAt:1});
    if(kind==="liveOld")await ctx.db.patch(f.old[0],{status:"new"});
    if(kind==="oldNotReset")await ctx.db.patch(f.old[0],{testReset:undefined});
    if(kind==="oldApproval")await ctx.db.patch(f.pre.state.flows.find(row=>row.interestId===f.old[0])!._id,{requesterFinalApproval:"approved"});
    if(kind==="profileDrift")await ctx.db.patch(f.scope.fromRegistrationId,{phone:"changed"});
    if(kind==="historyDrift")await ctx.db.patch(f.pre.state.history[0]._id,{message:"changed"});
  });
  const before=await all(f.t);
  const args={...f.args,...(kind==="defaultMode"?{mode:undefined}:{}),...(kind==="wrongFingerprint"?{expectedFingerprint:JSON.stringify(f.pre.state)}:{})};
  await expect(f.t.mutation(internal.singleInterestTestReset.reset,args)).rejects.toThrow();
  if(!["profileDrift","historyDrift","wrongFingerprint"].includes(kind))await expect(f.t.query(internal.singleInterestTestReset.preflight,{...f.scope,mode:args.mode})).rejects.toThrow();
  expect(await all(f.t)).toEqual(before);
});
test("closed_history never opts a fresh private target into broader history",async()=>{
  const f=await fixture();
  await expect(f.t.query(internal.singleInterestTestReset.preflight,{...f.scope,mode:"closed_history"})).rejects.toThrow();
});

test("large opaque legacy audits stay intact; repeated resets grow linearly, not recursively", async () => {
  const f = await fixture();
  await f.t.run(async ctx => {
    for (let i = 0; i < 4; i++) await ctx.db.insert("pairTestResetAudits", {
      operationKey: "large-legacy-" + i, request: JSON.stringify({opaque: String.fromCharCode(34, 92).repeat(60000)}),
      snapshot: JSON.stringify({nested: "legacy".repeat(20000)}), createdAt: 1,
    });
  });
  const legacy = await f.t.run(ctx => ctx.db.query("pairTestResetAudits").collect());
  for (let iteration = 0; iteration < 6; iteration++) {
    const pre = await f.t.query(internal.singleInterestTestReset.preflight, f.scope);
    expect(new TextEncoder().encode(pre.fingerprint).length).toBeLessThan(100000);
    for (const reference of pre.state.audits) {
      expect(reference.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(await f.t.run(ctx => ctx.db.get(reference._id))).not.toBeNull();
    }
    const args = {...f.args, expectedFingerprint: pre.fingerprint, operationKey: "repeat-operation-" + iteration};
    const result = await f.t.mutation(internal.singleInterestTestReset.reset, args);
    const audit = await f.t.run(ctx => ctx.db.get(result.auditId));
    expect(new TextEncoder().encode(JSON.stringify(audit)).length).toBeLessThan(300000);
    expect(audit!.snapshot).toBe(pre.fingerprint);
    expect(JSON.parse(audit!.request)).toEqual({helper: "singleInterestTestReset/v1", ...args});
    expect(await f.t.mutation(internal.singleInterestTestReset.reset, args)).toEqual({...result, alreadyReset: true});
    expect(await f.t.run(ctx => Promise.all(legacy.map(row => ctx.db.get(row._id))))).toEqual(legacy);
    // Synthetic fresh submission: never reopen/reset the previously archived row.
    await f.t.run(async ctx => {
      const {_id, _creationTime, ...interest} = pre.state.target;
      const {_id: flowId, _creationTime: flowTime, ...flow} = pre.state.targetFlow;
      void _id; void _creationTime; void flowId; void flowTime;
      f.scope.interestId = await ctx.db.insert("interests", interest);
      f.args.interestId = f.scope.interestId;
      f.flowId = await ctx.db.insert("interestFlows", {...flow, interestId: f.scope.interestId});
      await ctx.db.insert("interestFlowEvents", {interestId: f.scope.interestId, interestFlowId: f.flowId, actor: "system", eventType: "flow_created", createdAt: 1});
    });
  }
});
for (const field of ["request", "snapshot", "operationKey", "createdAt"] as const) test("audit manifest guards every historical field: " + field, async () => {
  const f = await fixture();
  await f.t.run(async ctx => {
    const audit = await ctx.db.query("pairTestResetAudits").first();
    await ctx.db.patch(audit!._id, {[field]: field === "createdAt" ? 99 : "changed opaque history"});
  });
  const before = await all(f.t);
  await expect(f.t.mutation(internal.singleInterestTestReset.reset, f.args)).rejects.toThrow("drift");
  expect(await all(f.t)).toEqual(before);
});
