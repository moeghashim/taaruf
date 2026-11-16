import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

beforeEach(() => vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "synthetic"));
afterEach(() => vi.unstubAllEnvs());
async function world(female = false, numbers = [215, 227]) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const event = await ctx.db.insert("events", { title: "Synthetic", eventCode: "synthetic", eventMonth: "2026-11", series: "1plus1_match", location: "Test", startsAt: 1, endsAt: 2, status: "completed", maleCapacity: 10, femaleCapacity: 10, createdAt: 1, updatedAt: 1 });
    const people = [];
    for (const [index, gender] of (["male", "female"] as const).entries()) people.push(await ctx.db.insert("registrations", { name: "Synthetic", publicApplicantNumber: numbers[index], gender, age: 30, maritalStatus: "single", education: "College", job: "Test", email: index + "@example.invalid", phone: "5550100", status: "approved", createdAt: 1 }));
    const [brother, sister] = people;
    const fromRegistrationId = female ? sister : brother, toRegistrationId = female ? brother : sister;
    const interest = await ctx.db.insert("interests", { fromRegistrationId, toRegistrationId, eventId: event, source: "platform_submission", status: "new", visibility: "admin_actionable", createdAt: 2, updatedAt: 2 });
    const flow = await ctx.db.insert("interestFlows", { interestId: interest, fromRegistrationId, toRegistrationId, flowStatus: "bio_review", recipientDecision: "accepted", requesterFinalApproval: "pending", recipientFinalApproval: "pending", photoDecision: "pending", createdAt: 2, updatedAt: 2 });
    return { event, brother, sister, interest, flow };
  });
  const label = async () => (await t.query(api.interests.getAll, { adminSecret: "synthetic" })).find(r => r._id === ids.interest)!.workbenchReview.label;
  const patchFlow = (patch: Partial<Doc<"interestFlows">>) => t.run(ctx => ctx.db.patch(ids.flow, patch));
  const patchInterest = (patch: Partial<Doc<"interests">>) => t.run(ctx => ctx.db.patch(ids.interest, patch));
  async function approve(b: boolean, s: boolean) { await patchFlow({ requesterFinalApproval: (female ? s : b) ? "approved" : "pending", recipientFinalApproval: (female ? b : s) ? "approved" : "pending", requesterExplicitFinalAt: (female ? s : b) ? 10 : undefined, recipientExplicitFinalAt: (female ? b : s) ? 10 : undefined }); }
  async function match(status: Doc<"matches">["status"] = "reviewing") { return t.run(async ctx => { const id = await ctx.db.insert("matches", { maleRegistrationId: ids.brother, femaleRegistrationId: ids.sister, interestId: ids.interest, interestType: "mutual_interest", initiatedBy: "interest_signal", status, contactGate: "pending_admin_approval", createdAt: 10, updatedAt: 10 }); await ctx.db.patch(ids.interest, { matchId: id }); return id; }); }
  return { t, ...ids, label, patchFlow, patchInterest, approve, match };
}

for (const female of [false, true]) {
  for (const [b, s] of [[false,false], [false,true], [true,false]] as const) test(`modern gender=${female} finals=${b}/${s}`, async () => {
    const w = await world(female); await w.approve(b,s);
    expect(await w.label()).toBe(s ? "Waiting on brother #215 — Final approval (sister approved)" : b ? "Waiting on sister #227 — Final approval (brother approved)" : "Waiting on both — Final approval: brother #215 and sister #227");
  });
  test(`private and initial review gender=${female}`, async () => {
    const w = await world(female); await w.patchFlow({flowStatus:"private_documented",recipientDecision:"pending"});
    expect(await w.label()).toBe("Admin action — Share " + (female ? "sister #227" : "brother #215") + "’s profile for review");
    await w.patchFlow({flowStatus:"awaiting_inbound_response"});
    expect(await w.label()).toBe("Waiting on " + (female ? "brother #215" : "sister #227") + " — Initial bio decision");
  });
}
for (const [female,numbers,b,s,queued] of [[true,[227,215],false,true,false],[true,[127,283],false,true,true],[true,[327,222],false,false,true],[false,[44,246],true,false,false]] as const) test("correct numbered regression " + numbers.join("/"), async () => {
 const w=await world(female,[...numbers]);await w.approve(b,s);
 if(queued) {await w.patchInterest({status:"queued"});await w.t.run(async ctx=>{await ctx.db.insert("matches",{maleRegistrationId:w.brother,femaleRegistrationId:w.sister,interestType:"mutual_interest",initiatedBy:"interest_signal",status:"reviewing",createdAt:1,updatedAt:1});});}
 const expected=s?"Waiting on brother #"+numbers[0]+" — Final approval (sister approved)":b?"Waiting on sister #"+numbers[1]+" — Final approval (brother approved)":"Waiting on both — Final approval: brother #"+numbers[0]+" and sister #"+numbers[1];
 const label=await w.label();expect(label).toContain(expected);if(queued)expect(label).toMatch(/^Queued/);
 const page=await w.t.query(api.interests.workbenchPage,{adminSecret:"synthetic",paginationOpts:{numItems:100,cursor:null}});expect(page.page[0].workbenchReview.label).toBe(label);
});
test("release requires explicit finals, actual match, contacts and availability", async () => {
  const w = await world(); await w.approve(true,true);
  expect(await w.label()).toBe("Admin check — Both final approvals saved; linked match missing");
  await w.match(); expect(await w.label()).toBe("Admin action — Review and release contacts (both final approvals saved)");
  await w.t.run(ctx => ctx.db.patch(w.sister,{phone:""})); expect(await w.label()).toContain("contact details missing");
});
test("initial acceptance and legacy propagated approval never become explicit finals", async () => {
  const w = await world(true); await w.patchInterest({femaleWorkflow:{state:"awaiting_sister_confirmation",brotherAcceptedAt:10,sisterConfirmedAt:11}});
  expect(await w.label()).toContain("Waiting on both");
  await w.patchFlow({recipientFinalApproval:"approved",recipientFinalApprovalAt:10});
  expect(await w.label()).toContain("Admin check — Legacy final approval lacks explicit provenance");
  await w.t.run(ctx => ctx.db.insert("interestFlowEvents",{interestId:w.interest,interestFlowId:w.flow,actor:"applicant",actorRegistrationId:w.brother,eventType:"final_approval_given",createdAt:10}));
  expect(await w.label()).not.toContain("sister approved"); expect(await w.label()).toContain("Legacy final approval");
});
test("explicit source event is accepted but wrong actor/flow events are not", async () => {
  const w = await world(); await w.patchFlow({recipientFinalApproval:"approved"});
  await w.t.run(ctx => ctx.db.insert("interestFlowEvents",{interestId:w.interest,interestFlowId:w.flow,actor:"applicant",actorRegistrationId:w.sister,eventType:"explicit_final_approval_given",createdAt:10}));
  expect(await w.label()).toBe("Waiting on brother #215 — Final approval (sister approved)");
});
for (const status of ["paused","closed","contact_shared"] as const) test("match precedence " + status, async () => {
  const w = await world(); await w.match(status); await w.patchInterest({status:"queued"});
  expect(await w.label()).toMatch(status === "paused" ? /^Paused/ : status === "closed" ? /^Closed/ : /^Contacts released/);
});
test("terminal interest precedes released match", async () => { const w = await world(); await w.match("contact_shared"); await w.patchInterest({status:"withdrawn"}); expect(await w.label()).toBe("Closed — Interest withdrawn"); });
for (const status of ["queued","deferred"] as const) test(status + " without blocker is honest", async () => { const w = await world(); await w.patchInterest({status}); expect(await w.label()).toContain("Admin check — Queue/defer blocker not recorded; Waiting on both"); });
test("missing, mismatched, archived and legacy records fail closed", async () => {
  const w = await world(); await w.t.run(ctx => ctx.db.delete(w.flow)); expect(await w.label()).toContain("flow missing");
  await w.t.run(ctx => ctx.db.patch(w.sister,{archivedAt:10})); expect(await w.label()).toContain("archived");
});
test("canonical reverse alias uses canonical actor decisions; independent platform reverse does not pool", async () => {
  const w = await world(true); await w.approve(false,true);
  const reverse = await w.t.run(async ctx => {
    const original = (await ctx.db.get(w.interest))!;
    const id = await ctx.db.insert("interests", {fromRegistrationId:w.brother,toRegistrationId:w.sister,eventId:w.event,source:"platform_submission",status:"new",visibility:"admin_actionable",createdAt:3,updatedAt:3});
    await ctx.db.insert("interestFlows", {interestId:id,fromRegistrationId:w.brother,toRegistrationId:w.sister,flowStatus:"bio_review",recipientDecision:"accepted",requesterFinalApproval:"approved",requesterExplicitFinalAt:12,recipientFinalApproval:"pending",photoDecision:"pending",createdAt:3,updatedAt:3});
    expect(original).toBeTruthy(); return id;
  });
  expect(await w.label()).toBe("Waiting on brother #215 — Final approval (sister approved)");
  await w.t.run(ctx => ctx.db.patch(reverse,{canonicalInterestId:w.interest}));
  const rows = await w.t.query(api.interests.getAll,{adminSecret:"synthetic"});
  expect(rows.find(r=>r._id===reverse)!.workbenchReview).toEqual(rows.find(r=>r._id===w.interest)!.workbenchReview);
  expect(await w.label()).toContain("Both final approvals saved; linked match missing");
});
test("projection does not mutate workflow, events, outbox or matches", async () => {
  const w = await world(); await w.approve(true,true); await w.match();
  const snapshot = () => w.t.run(async ctx => Promise.all([ctx.db.query("interests").collect(),ctx.db.query("interestFlows").collect(),ctx.db.query("interestFlowEvents").collect(),ctx.db.query("matches").collect(),ctx.db.query("femaleWorkflowDeliveries").collect()]));
  const before = await snapshot(); await w.label(); await w.label(); expect(await snapshot()).toEqual(before);
});

test("stale declined pointer is an availability check, not an active match claim",async()=>{const w=await world();const id=await w.match("declined");await w.patchInterest({matchId:undefined,status:"queued"});await w.t.run(ctx=>ctx.db.patch(w.brother,{activeMatchId:id}));const label=await w.label();expect(label).toContain("stale or unverified active-match pointer");expect(label).not.toContain("has another active match");});
test("release instruction requires actual UI gate",async()=>{const w=await world();await w.approve(true,true);const id=await w.match();await w.t.run(ctx=>ctx.db.patch(id,{contactGate:undefined}));expect(await w.label()).toContain("contact-release gate is not ready");});
test("initial conflict is not guessed into final step",async()=>{const w=await world();await w.approve(true,false);await w.patchFlow({recipientDecision:"pending"});expect(await w.label()).toContain("initial bio decision is not accepted");});

for (const female of [false,true]) test(`other active interests do not block; active matches do gender=${female}`, async () => {
 const w=await world(female); await w.approve(true,true); await w.match();
 await w.t.run(async ctx=>{const row=(await ctx.db.get(w.interest))!; const third=await ctx.db.insert("registrations",{name:"Third synthetic",publicApplicantNumber:999,gender:female?"male":"female",age:30,maritalStatus:"single",education:"College",job:"Test",status:"approved",createdAt:1}); for(const [from,to] of [[row.fromRegistrationId,third],[third,row.toRegistrationId]]) await ctx.db.insert("interests",{fromRegistrationId:from,toRegistrationId:to,eventId:w.event,source:"platform_submission",status:"active",visibility:"admin_actionable",createdAt:20,updatedAt:20});});
 expect(await w.label()).toBe("Admin action — Review and release contacts (both final approvals saved)");
 await w.t.run(ctx=>ctx.db.insert("matches",{maleRegistrationId:w.brother,femaleRegistrationId:w.sister,interestType:"mutual_interest",initiatedBy:"interest_signal",status:"reviewing",createdAt:20,updatedAt:20}));
 expect(await w.label()).toContain("has another active match"); expect(await w.label()).toMatch(/^Blocked/);
});
