import { convexTest } from "convex-test";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import type { Doc } from "./_generated/dataModel";
const adminSecret = "terminal-test";
beforeEach(() => vi.stubEnv("ATTENDANCE_ADMIN_SECRET", adminSecret));
afterEach(() => vi.unstubAllEnvs());
async function fixture(status: Doc<"matches">["status"] = "reviewing") {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const base = { age: 30, maritalStatus: "single", education: "College", job: "Engineer", phone: "5550100", status: "approved" as const, profileCompletionStatus: "completed" as const, searchStatus: "active" as const, createdAt: 1 };
    const male = await ctx.db.insert("registrations", {...base, name: "Man", gender: "male", email: "m@example.invalid"});
    const female = await ctx.db.insert("registrations", {...base, name: "Woman", gender: "female", email: "f@example.invalid"});
    const other = await ctx.db.insert("registrations", {...base, name: "Other", gender: "female", email: "o@example.invalid"});
    const match = await ctx.db.insert("matches", {maleRegistrationId: male, femaleRegistrationId: female, status, interestType: "man_interested", createdAt: 1, updatedAt: 1});
    for (const id of [male, female]) await ctx.db.patch(id, {activeMatchId: match});
    const event = await ctx.db.insert("events", {title: "Manual", eventCode: "manual-admin", eventMonth: "2026-11", series: "test", location: "Test", startsAt: 1, endsAt: 2, status: "completed", maleCapacity: 10, femaleCapacity: 10, createdAt: 1, updatedAt: 1});
    for (const [registrationId, sessionHash] of [[male,"male"],[other,"other"]] as const) await ctx.db.insert("applicantSessions", {registrationId, sessionHash, expiresAt: Date.now()+100000, createdAt: 1});
    return {male,female,other,match,event};
  });
  return {t,...ids};
}
test.each(["new","reviewing","contact_shared","paused","closed","declined"] as const)("close from %s clears only own pointers and enables fresh candidates/drafts", async status => {
  const {t,male,female,other,match} = await fixture(status);
  const terminal = status === "declined" ? "declined" : "closed";
  await t.mutation(api.matches.updateStatus,{adminSecret,id:match,status:terminal,adminNotes:"retain history"});
  for (const id of [male,female]) expect((await t.run(ctx=>ctx.db.get(id)))?.activeMatchId).toBeUndefined();
  expect((await t.query(api.matches.getCandidates,{adminSecret})).map(p=>p._id)).toContain(male);
  const fresh = await t.mutation(api.matches.create,{adminSecret,maleRegistrationId:male,femaleRegistrationId:other});
  expect(await t.run(ctx=>ctx.db.get(fresh))).toMatchObject({status:"new",interestType:"admin_suggested"});
  expect((await t.run(ctx=>ctx.db.get(match)))?.status).toBe(terminal);
  await expect(t.mutation(api.matches.updateStatus,{adminSecret,id:match,status:"contact_shared"})).rejects.toThrow("not active");
});
test.each(["closed","declined"] as const)("stale %s pointer allows new interest, response and explicit final approvals without reviving history", async status => {
  const {t,male,other,match,event} = await fixture(status);
  const history = await t.run(ctx=>ctx.db.get(match));
  expect((await t.query(api.matches.getCandidates,{adminSecret})).map(p=>p._id)).toContain(male);
  const interestId = await t.mutation(api.interests.create,{adminSecret,fromRegistrationId:male,toRegistrationId:other,eventId:event,source:"admin_entered"});
  expect((await t.run(ctx=>ctx.db.get(interestId)))?.status).toBe("new");
  await t.mutation(api.applicantInterests.respondToInbound,{sessionHash:"other",interestId,decision:"accept"});
  await t.mutation(api.applicantInterests.giveFinalApproval,{sessionHash:"male",interestId,approved:true});
  expect((await t.run(ctx=>ctx.db.get(interestId)))?.matchId).toBeUndefined();
  await t.mutation(api.applicantInterests.giveFinalApproval,{sessionHash:"other",interestId,approved:true});
  const fresh = (await t.run(ctx=>ctx.db.get(interestId)))!.matchId!;
  expect(fresh).not.toBe(match);
  expect(await t.run(ctx=>ctx.db.get(fresh))).toMatchObject({status:"reviewing",contactGate:"pending_admin_approval"});
  expect(await t.run(ctx=>ctx.db.get(match))).toEqual(history);
  const flow = await t.run(ctx=>ctx.db.query("interestFlows").withIndex("by_interestId",q=>q.eq("interestId",interestId)).unique());
  expect(flow?.contactSharedAt).toBeUndefined();
});
test.each(["active","missing","foreign","paused"])("%s pointer remains blocking", async kind => {
  const {t,male,other,match,event} = await fixture(kind === "paused" ? "paused" : "contact_shared");
  if (kind === "missing") await t.run(ctx=>ctx.db.delete(match));
  if (kind === "foreign") await t.run(ctx=>ctx.db.patch(match,{maleRegistrationId:other,status:"closed"}));
  expect((await t.query(api.matches.getCandidates,{adminSecret})).map(p=>p._id)).not.toContain(male);
  await expect(t.mutation(api.matches.create,{adminSecret,maleRegistrationId:male,femaleRegistrationId:other})).rejects.toThrow("active match");
  const id = await t.mutation(api.interests.create,{adminSecret,fromRegistrationId:male,toRegistrationId:other,eventId:event,source:"admin_entered"});
  expect((await t.run(ctx=>ctx.db.get(id)))?.status).toBe("queued");
  await t.mutation(api.applicantInterests.respondToInbound,{sessionHash:"other",interestId:id,decision:"accept"});
  await t.mutation(api.applicantInterests.giveFinalApproval,{sessionHash:"male",interestId:id,approved:true});
  await expect(t.mutation(api.applicantInterests.giveFinalApproval,{sessionHash:"other",interestId:id,approved:true})).rejects.toThrow("active match");
});
test.each(["closed","declined"] as const)("late %s preserves newer pointer, including resetPair", async status => {
  const {t,male,other,match,female} = await fixture();
  const newer = await t.run(async ctx=>{
    const id=await ctx.db.insert("matches",{maleRegistrationId:male,femaleRegistrationId:other,status:"contact_shared",interestType:"man_interested",createdAt:2,updatedAt:2});
    await ctx.db.patch(male,{activeMatchId:id}); return id;
  });
  await t.mutation(api.matches.updateStatus,{adminSecret,id:match,status});
  expect((await t.run(ctx=>ctx.db.get(male)))?.activeMatchId).toBe(newer);
  expect((await t.run(ctx=>ctx.db.get(female)))?.activeMatchId).toBeUndefined();
  await t.mutation(api.matches.resetPair,{adminSecret,registrationAId:male,registrationBId:female});
  expect((await t.run(ctx=>ctx.db.get(male)))?.activeMatchId).toBe(newer);
});

test.each(["closed", "declined"] as const)("actual applicant submission after stale %s retains auth/event/consent gates", async status => {
  const {t,male,other,match,event} = await fixture(status);
  await t.run(async ctx => {
    await ctx.db.patch(event,{interestSubmissionsEnabled:true,eventCode:"selected",series:"1plus1_match"});
    await ctx.db.patch(other,{publicApplicantNumber:77});
    await ctx.db.insert("eventRegistrations",{registrationId:male,eventId:event,gender:"male",registrationStatus:"approved",confirmationStatus:"confirmed",attendanceStatus:"attended",eligibilityStatus:"approved_member",createdAt:1,updatedAt:1});
  });
  const args = {sessionHash:"male",expectedEventId:event,applicantNumber:77,applicantName:"Other"};
  await expect(t.mutation(api.applicantInterests.submitInterestNumber,{...args,sessionHash:"forged"})).rejects.toThrow();
  await t.run(ctx=>ctx.db.patch(event,{interestSubmissionsEnabled:false}));
  await expect(t.mutation(api.applicantInterests.submitInterestNumber,args)).rejects.toThrow("unavailable");
  await t.run(ctx=>ctx.db.patch(event,{interestSubmissionsEnabled:true}));
  const result = await t.mutation(api.applicantInterests.submitInterestNumber,args);
  expect(await t.run(ctx=>ctx.db.get(result.interestId))).toMatchObject({status:"new",source:"platform_submission"});
  expect((await t.run(ctx=>ctx.db.get(match)))?.status).toBe(status);
  expect((await t.run(ctx=>ctx.db.get(male)))?.activeMatchId).toBe(match);
  const flows = await t.run(ctx=>ctx.db.query("interestFlows").collect());
  expect(flows[0]).toMatchObject({requesterFinalApproval:"pending",recipientFinalApproval:"pending"});
});
test("normal pause still clears own pointer and frees new-pair eligibility", async()=>{
  const {t,male,other,match}=await fixture("contact_shared");
  await t.mutation(api.matches.updateStatus,{adminSecret,id:match,status:"paused"});
  expect((await t.run(ctx=>ctx.db.get(male)))?.activeMatchId).toBeUndefined();
  await expect(t.mutation(api.matches.create,{adminSecret,maleRegistrationId:male,femaleRegistrationId:other})).resolves.toBeTruthy();
});

import { hasBlockingMatch } from './matchAvailability';
import { promoteOldestQueuedForRegistration } from './interestRules';
import { pendingReciprocal } from './reciprocalConnection';
import { assertParticipantsAvailable, recordPairApproval } from './contactGate';
const occupancyCases = (["male", "female"] as const).flatMap(gender =>
  (["absent", "closed", "declined"] as const).flatMap(pointer =>
    (["reviewing", "contact_shared", "new"] as const).flatMap(status =>
      (["maleRegistrationId", "femaleRegistrationId"] as const).map(index => ({gender,pointer,status,index})))));
test.each(occupancyCases)('actual occupancy $gender/$pointer/$status/$index blocks every eligibility gate', async ({gender,pointer,status,index}) => {
  const {t,male,female,other,match,event} = await fixture(pointer === 'absent' ? 'closed' : pointer);
  const person = gender === 'male' ? male : female;
  const target = gender === 'male' ? other : male;
  await t.run(async ctx => {
    await ctx.db.patch(person,{activeMatchId:pointer === 'absent' ? undefined : match});
    await ctx.db.insert('matches',{maleRegistrationId:index === 'maleRegistrationId' ? person : other,femaleRegistrationId:index === 'femaleRegistrationId' ? person : other,status,interestType:'admin_suggested',matchmakerPresentedAt:2,createdAt:2,updatedAt:2});
  });
  expect((await t.query(api.matches.getCandidates,{adminSecret})).map(p=>p._id)).not.toContain(person);
  const id = await t.mutation(api.interests.create,{adminSecret,fromRegistrationId:person,toRegistrationId:target,eventId:event,source:'admin_entered'});
  expect((await t.run(ctx=>ctx.db.get(id)))?.status).toBe('queued');
  expect(await t.run(ctx=>promoteOldestQueuedForRegistration(ctx,person))).toBeNull();
  expect(await t.run(async ctx=>pendingReciprocal(ctx,(await ctx.db.get(person))!,(await ctx.db.get(target))!,event))).toBeNull();
  await expect(t.run(ctx=>assertParticipantsAvailable(ctx,male,gender === 'male' ? other : female))).rejects.toThrow('active match');
  await expect(t.mutation(api.matches.create,{adminSecret,maleRegistrationId:male,femaleRegistrationId:gender === 'male' ? other : female})).rejects.toThrow();
});
test.each(['paused','draft','reset'] as const)('%s actual history retains availability exception',async kind=>{
  const {t,male,match}=await fixture('closed');
  await t.run(async ctx=>{
    await ctx.db.patch(male,{activeMatchId:undefined});
    await ctx.db.patch(match,{status:kind==='paused'?'paused':'reviewing',interestType:kind==='draft'?'admin_suggested':'man_interested',testResetAt:kind==='reset'?2:undefined});
  });
  expect(await t.run(async ctx=>hasBlockingMatch(ctx,(await ctx.db.get(male))!))).toBe(false);
});
test('bounded history overflow fails closed',async()=>{
  const {t,male,other,match}=await fixture('closed');
  await t.run(async ctx=>{
    for(let i=0;i<1000;i++) await ctx.db.insert('matches',{maleRegistrationId:male,femaleRegistrationId:other,status:'closed',interestType:'man_interested',createdAt:1,updatedAt:1});
    expect(await hasBlockingMatch(ctx,(await ctx.db.get(male))!,match)).toBe(true);
  });
});
test.each(['closed','declined','withdrawn'] as const)('direct activation/status cannot revive %s interest',async status=>{
  const {t,male,other,event}=await fixture('closed');
  const id=await t.mutation(api.interests.create,{adminSecret,fromRegistrationId:male,toRegistrationId:other,eventId:event,source:'admin_entered'});
  await t.run(ctx=>ctx.db.patch(id,{status}));
  const before=await t.run(ctx=>ctx.db.get(id));
  await expect(t.mutation(api.interests.progressFirst,{adminSecret,interestId:id})).rejects.toThrow('no longer active');
  for(const next of ['new','active','queued','deferred'] as const) await expect(t.mutation(api.interests.updateStatus,{adminSecret,id,status:next})).rejects.toThrow('no longer active');
  expect(await t.run(ctx=>ctx.db.get(id))).toEqual(before);
});
test.each(['valid','foreign','terminal'] as const)('legacy linked final decline %s is rejected without partial terminalization',async kind=>{
  const {t,male,other,event,match,female}=await fixture('closed');
  const id=await t.mutation(api.interests.create,{adminSecret,fromRegistrationId:male,toRegistrationId:other,eventId:event,source:'admin_entered'});
  await t.run(async ctx=>{
    await ctx.db.patch(match,{status:kind==='terminal'?'closed':'reviewing',interestId:id,femaleRegistrationId:kind==='foreign'?female:other});
    await ctx.db.patch(id,{matchId:match,status:'active'});
  });
  const before=await t.run(async ctx=>({match:await ctx.db.get(match),interest:await ctx.db.get(id),flows:await ctx.db.query('interestFlows').collect()}));
  await expect(t.run(async ctx=>recordPairApproval(ctx,(await ctx.db.get(id))!,male,false))).rejects.toThrow();
  expect(await t.run(async ctx=>({match:await ctx.db.get(match),interest:await ctx.db.get(id),flows:await ctx.db.query('interestFlows').collect()}))).toEqual(before);
});

test('matchmaker withdrawal and retry preserve newer pointers and consent history',async()=>{
  const {t,male,other,match}=await fixture('reviewing');
  const newer=await t.run(async ctx=>{
    await ctx.db.patch(match,{interestType:'admin_suggested',matchmakerPresentedAt:1,maleMatchmakerApprovalAt:2});
    const id=await ctx.db.insert('matches',{maleRegistrationId:male,femaleRegistrationId:other,status:'contact_shared',interestType:'man_interested',createdAt:2,updatedAt:2});
    await ctx.db.patch(male,{activeMatchId:id});return id;
  });
  for(let i=0;i<2;i++) await t.mutation(api.matchmakerMatching.withdraw,{sessionHash:'male',matchId:match});
  expect((await t.run(ctx=>ctx.db.get(male)))?.activeMatchId).toBe(newer);
  expect(await t.run(ctx=>ctx.db.get(match))).toMatchObject({status:'closed',maleMatchmakerApprovalAt:2});
  await expect(t.mutation(api.matchmakerMatching.approve,{sessionHash:'male',matchId:match})).rejects.toThrow();
});
test.each(['closed','declined'] as const)('terminal %s linked pair cannot be reopened through direct interest routes',async status=>{
  const {t,male,other,match,event}=await fixture(status);
  const id=await t.mutation(api.interests.create,{adminSecret,fromRegistrationId:male,toRegistrationId:other,eventId:event,source:'admin_entered'});
  await t.run(async ctx=>{await ctx.db.patch(match,{femaleRegistrationId:other,interestId:id});await ctx.db.patch(id,{matchId:match});});
  await expect(t.mutation(api.interests.progressFirst,{adminSecret,interestId:id})).rejects.toThrow('not active');
  await expect(t.mutation(api.interests.updateStatus,{adminSecret,id,status:'active'})).rejects.toThrow('not active');
});

test.each(['male','female'] as const)('actual applicant submission queues when %s has unpointed occupancy',async gender=>{
  const {t,male,female,other,match,event}=await fixture('closed');
  const from=gender==='male'?male:female;
  const to=gender==='male'?other:male;
  await t.run(async ctx=>{
    await ctx.db.patch(event,{interestSubmissionsEnabled:true,eventCode:'selected',series:'1plus1_match'});
    await ctx.db.patch(to,{publicApplicantNumber:77});
    await ctx.db.patch(from,{activeMatchId:undefined});
    await ctx.db.patch(match,{status:'reviewing'});
    await ctx.db.insert('applicantSessions',{registrationId:from,sessionHash:'submit',expiresAt:Date.now()+100000,createdAt:1});
    await ctx.db.insert('eventRegistrations',{registrationId:from,eventId:event,gender,registrationStatus:'approved',confirmationStatus:'confirmed',attendanceStatus:'attended',eligibilityStatus:'approved_member',createdAt:1,updatedAt:1});
  });
  const result=await t.mutation(api.applicantInterests.submitInterestNumber,{sessionHash:'submit',expectedEventId:event,applicantNumber:77,applicantName:gender==='male'?'Other':'Man'});
  expect((await t.run(ctx=>ctx.db.get(result.interestId)))?.status).toBe('queued');
});
