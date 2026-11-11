import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
const adminSecret = "synthetic-female-admin";
const hash = "a".repeat(64);
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
async function fixture() {
  vi.stubEnv("ATTENDANCE_ADMIN_SECRET", adminSecret);
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const now = Date.now();
    const base = { age: 30, maritalStatus: "single", education: "College", job: "Engineer", phone: "5550100", status: "approved" as const, createdAt: now };
    const sister = await ctx.db.insert("registrations", { ...base, name: "Synthetic Sister", gender: "female", email: "sister@example.com" });
    const brother = await ctx.db.insert("registrations", { ...base, name: "Synthetic Brother", gender: "male", email: "brother@example.com" });
    const other = await ctx.db.insert("registrations", { ...base, name: "Other", gender: "male", email: "other@example.com" });
    const event = await ctx.db.insert("events", { title: "Synthetic", eventCode: "test", eventMonth: "2026-11", series: "test", location: "Test", startsAt: now, endsAt: now, status: "completed", maleCapacity: 1, femaleCapacity: 1, createdAt: now, updatedAt: now });
    const interestId = await ctx.db.insert("interests", { fromRegistrationId: sister, toRegistrationId: brother, eventId: event, source: "platform_submission", status: "new", visibility: "internal_only", senderPhotoConsent: "no", femaleWorkflow: { state: "private_documented" }, createdAt: now, updatedAt: now });
    await ctx.db.insert("interestFlows", { interestId, fromRegistrationId: sister, toRegistrationId: brother, flowStatus: "private_documented", recipientDecision: "pending", requesterFinalApproval: "pending", recipientFinalApproval: "pending", photoDecision: "pending", createdAt: now, updatedAt: now });
    for (const [registrationId, sessionHash] of [[sister, "sister"], [brother, "brother"], [other, "other"]] as const) await ctx.db.insert("applicantSessions", { registrationId, sessionHash, expiresAt: now + 86400000, createdAt: now });
    return { sister, brother, interestId };
  });
  return { t, ...ids };
}

async function shared() { const f = await fixture(); await f.t.mutation(api.femaleInterestWorkflow.createReview, {adminSecret, interestId:f.interestId,reviewTokenHash:hash}); return f; }
function privatePayload(value: unknown) {
  const json = JSON.stringify(value);
  for (const key of ["awaiting_brother_review", "awaiting_sister_confirmation", "pending_admin_approval", "brotherAcceptedAt", "sisterConfirmedAt", "recipientFinalApproval", "requesterFinalApproval", "matchId", "reviewTokenHash", "reviewExpiresAt"]) expect(json).not.toContain(key);
}
test("both applicant roles receive only neutral status and their own decision/action", async () => {
 const {t,interestId}=await shared();
 const list=(sessionHash:string)=>t.query(api.femaleInterestWorkflow.getDashboardPage,{sessionHash,paginationOpts:{numItems:50,cursor:null}});
 expect((await list("brother")).page[0]).toMatchObject({state:"in_review",ownAction:"review",ownDecision:"pending"});
 expect((await list("sister")).page[0]).toMatchObject({state:"in_review",ownAction:null,ownDecision:"pending"});
 const accepted=await t.mutation(api.femaleInterestWorkflow.respond,{sessionHash:"brother",interestId,decision:"accept"});
 expect(accepted).toEqual({ownDecision:"approved"});
 for(const role of ["brother","sister"]){privatePayload(await list(role));privatePayload(await t.query(api.femaleInterestWorkflow.getReviewAccess,{sessionHash:role,interestId}));}
 expect((await list("sister")).page[0]).toMatchObject({ownAction:"review",ownDecision:"pending"});
 expect((await list("brother")).page[0]).toMatchObject({ownAction:null,ownDecision:"approved"});
 expect(await t.mutation(api.femaleInterestWorkflow.confirm,{sessionHash:"sister",interestId,confirmed:true})).toEqual({ownDecision:"approved"});
 for(const role of ["brother","sister"]){ const detail=await t.query(api.femaleInterestWorkflow.getReviewAccess,{sessionHash:role,interestId});privatePayload(detail);expect(detail).toMatchObject({state:"in_review",ownDecision:"approved",ownAction:null,profile:{email:null,phone:null}}); }
 expect((await t.run(ctx=>ctx.db.get(interestId)))?.femaleWorkflow?.state).toBe("pending_admin_approval");
 await t.mutation(api.femaleInterestWorkflow.releaseContacts,{adminSecret,interestId});
 expect(await t.query(api.femaleInterestWorkflow.getReviewAccess,{sessionHash:"sister",interestId})).toMatchObject({state:"contacts_released",profile:{email:"brother@example.com"}});
});
for(const decliner of ["brother","sister"])test("neutral closure preserves only own decision: "+decliner,async()=>{
 const {t,interestId}=await shared();
 if(decliner==="sister") {await t.mutation(api.femaleInterestWorkflow.respond,{sessionHash:"brother",interestId,decision:"accept"});await t.mutation(api.femaleInterestWorkflow.confirm,{sessionHash:"sister",interestId,confirmed:false});}
 else await t.mutation(api.femaleInterestWorkflow.respond,{sessionHash:"brother",interestId,decision:"decline"});
 for(const role of ["brother","sister"]){const rows=await t.query(api.femaleInterestWorkflow.getDashboard,{sessionHash:role});expect(rows[0]).toMatchObject({state:"closed",ownAction:null,canView:false,ownDecision:role===decliner?"declined":role==="brother"?"approved":"pending"});privatePayload(rows);await expect(t.query(api.femaleInterestWorkflow.getReviewAccess,{sessionHash:role,interestId})).rejects.toThrow("unavailable");}
});
test("neutral email copy preserves delivery gates and frozen retry payloads",async()=>{
 const {t,interestId}=await shared();
 vi.stubEnv("FEMALE_WORKFLOW_EMAIL_MODE","isolated");vi.stubEnv("FEMALE_WORKFLOW_EMAIL_ALLOWED_RECIPIENTS","sister@example.com,brother@example.com");vi.stubEnv("FEMALE_WORKFLOW_PORTAL_URL","https://synthetic.example.com");vi.stubEnv("FEMALE_WORKFLOW_EMAIL_FROM","test@example.com");vi.stubEnv("FEMALE_WORKFLOW_RESEND_API_KEY","synthetic-only");
 await t.mutation(api.femaleInterestWorkflow.respond,{sessionHash:"brother",interestId,decision:"accept"});
 const [row]=await t.mutation(internal.femaleWorkflowDelivery.claim,{});
 const payload=await t.mutation(internal.femaleWorkflowDelivery.markAttempt,{id:row._id,attempt:row.attempts});
 expect(payload).toMatchObject({subject:"This connection is awaiting your review"});expect(JSON.stringify(payload)).not.toMatch(/brother has accepted|mutual match/i);
 expect(payload && payload.text).toContain("This connection is awaiting your review.");
 expect(await t.mutation(internal.femaleWorkflowDelivery.markAttempt,{id:row._id,attempt:row.attempts})).toEqual(payload);
});

test("expiry, reset, pause and authorization retain their gates",async()=>{
 const {t,interestId}=await shared();
 await expect(t.query(api.femaleInterestWorkflow.getReviewAccess,{sessionHash:"other",interestId})).rejects.toThrow("Unauthorized");
 await t.run(async ctx=>{const row=(await ctx.db.get(interestId))!;await ctx.db.patch(interestId,{femaleWorkflow:{...row.femaleWorkflow!,reviewExpiresAt:Date.now()-1}});});
 expect((await t.query(api.femaleInterestWorkflow.getDashboard,{sessionHash:"brother"}))[0]).toMatchObject({ownAction:null,reviewExpired:true});
 await expect(t.mutation(api.femaleInterestWorkflow.respond,{sessionHash:"brother",interestId,decision:"accept"})).rejects.toThrow("expired");
 await t.mutation(api.femaleInterestWorkflow.createReview,{adminSecret,interestId,reviewTokenHash:hash});
 await t.mutation(api.femaleInterestWorkflow.respond,{sessionHash:"brother",interestId,decision:"accept"});
 await t.mutation(api.femaleInterestWorkflow.confirm,{sessionHash:"sister",interestId,confirmed:true});
 await t.run(async ctx=>{const row=(await ctx.db.get(interestId))!;await ctx.db.patch(row.matchId!,{status:"paused"});});
 expect(await t.query(api.femaleInterestWorkflow.getReviewAccess,{sessionHash:"sister",interestId})).toMatchObject({paused:true,ownAction:null,profile:{email:null,phone:null}});
 await expect(t.mutation(api.femaleInterestWorkflow.releaseContacts,{adminSecret,interestId})).rejects.toThrow("unavailable");
 await t.run(ctx=>ctx.db.patch(interestId,{testReset:{at:Date.now(),actor:"admin",reason:"synthetic"}}));
 for(const sessionHash of ["sister","brother"])expect(await t.query(api.femaleInterestWorkflow.getDashboard,{sessionHash})).toEqual([]);
});
