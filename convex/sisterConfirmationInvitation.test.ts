import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
const adminSecret = "synthetic-female-admin";
const hash = "a".repeat(64);
describe.each(["sister-confirmation-production", "brother-sister-review-production"])("%s", productionMode => {
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
async function fixture(general = false) {
  vi.stubEnv("ATTENDANCE_ADMIN_SECRET", adminSecret);
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const now = Date.now();
    const base = { age: 30, maritalStatus: "single", education: "College", job: "Engineer", phone: "5550100", status: "approved" as const, createdAt: now };
    const sister = await ctx.db.insert("registrations", { ...base, name: "Synthetic Sister", gender: "female", email: "sister@example.com" });
    const brother = await ctx.db.insert("registrations", { ...base, name: "Synthetic Brother", gender: "male", email: "brother@example.com" });
    const other = await ctx.db.insert("registrations", { ...base, name: "Other", gender: "male", email: "other@example.com" });
    const event = await ctx.db.insert("events", { title: "Synthetic", eventCode: "test", eventMonth: "2026-11", series: "test", location: "Test", startsAt: now, endsAt: now, status: "completed", maleCapacity: 1, femaleCapacity: 1, createdAt: now, updatedAt: now });
    const interestId = await ctx.db.insert("interests", { fromRegistrationId: general ? brother : sister, toRegistrationId: general ? sister : brother, eventId: event, source: "platform_submission", status: "new", visibility: general ? "admin_actionable" : "internal_only", senderPhotoConsent: "no", ...(general ? {} : { femaleWorkflow: { state: "private_documented" as const } }), createdAt: now, updatedAt: now });
    await ctx.db.insert("interestFlows", { interestId, fromRegistrationId: general ? brother : sister, toRegistrationId: general ? sister : brother, flowStatus: general ? "awaiting_inbound_response" : "private_documented", recipientDecision: "pending", requesterFinalApproval: "pending", recipientFinalApproval: "pending", photoDecision: "pending", createdAt: now, updatedAt: now });
    for (const [registrationId, sessionHash] of [[sister, "sister"], [brother, "brother"], [other, "other"]] as const) await ctx.db.insert("applicantSessions", { registrationId, sessionHash, expiresAt: now + 86400000, createdAt: now });
    return { sister, brother, interestId };
  });
  return { t, ...ids };
}
function isolated() {
  vi.stubEnv("FEMALE_WORKFLOW_EMAIL_MODE", "isolated");
  vi.stubEnv("FEMALE_WORKFLOW_EMAIL_ALLOWED_RECIPIENTS", "sister@example.com,brother@example.com");
  vi.stubEnv("FEMALE_WORKFLOW_PORTAL_URL", "https://synthetic.example.com");
  vi.stubEnv("FEMALE_WORKFLOW_EMAIL_FROM", "test@example.com");
  vi.stubEnv("FEMALE_WORKFLOW_RESEND_API_KEY", "synthetic-only");
}

async function prepared(activate = true) {
 const f=await fixture();isolated();await f.t.mutation(api.femaleInterestWorkflow.createReview,{adminSecret,interestId:f.interestId,reviewTokenHash:hash});
 vi.stubEnv("FEMALE_WORKFLOW_EMAIL_MODE",productionMode);vi.stubEnv("FEMALE_WORKFLOW_PRODUCTION_APPROVED","true");vi.stubEnv("FEMALE_WORKFLOW_PORTAL_URL","https://www.1plus1match.com");
 if(activate){const at=Number(await f.t.mutation(internal.femaleWorkflowDelivery.activateSisterConfirmation,{}));vi.spyOn(Date,"now").mockReturnValue(at+1);}return f;
}
const accept=(f:Awaited<ReturnType<typeof prepared>>)=>f.t.mutation(api.femaleInterestWorkflow.respond,{sessionHash:"brother",interestId:f.interestId,decision:"accept"});
const rows=(f:Awaited<ReturnType<typeof prepared>>)=>f.t.run(ctx=>ctx.db.query("femaleWorkflowDeliveries").withIndex("by_kind_and_status_and_nextAttemptAt",q=>q.eq("kind","sister_confirmation")).take(100));
test("concurrent acceptance queues once; email and authenticated GET never create match",async()=>{
 const f=await prepared();const provider=vi.fn().mockResolvedValue(new Response("{}",{status:200}));vi.stubGlobal("fetch",provider);
 expect(await rows(f)).toEqual([]);await Promise.all([accept(f),accept(f)]);expect(await rows(f)).toHaveLength(1);
 await Promise.all([f.t.action(internal.femaleWorkflowDelivery.drain,{}),f.t.action(internal.femaleWorkflowDelivery.drain,{})]);expect(provider).toHaveBeenCalledTimes(1);
 const payload=JSON.parse(provider.mock.calls[0][1].body);expect(payload.to).toEqual(["sister@example.com"]);
 expect(payload.text).toContain("This connection is awaiting your review");expect(payload.text).not.toContain("The brother has accepted");expect(payload.text).toContain("explicitly confirm or decline");expect(payload.text).toContain("Opening this link does not approve or create a match");expect(payload.text).toContain("Review profile and respond: https://www.1plus1match.com/dashboard?femaleReview="+f.interestId);
 for(const value of ["Synthetic Brother","brother@example.com","5550100",hash,"photo"])expect(payload.text).not.toContain(value);
 await f.t.query(api.femaleInterestWorkflow.getReviewAccess,{sessionHash:"sister",interestId:f.interestId});await expect(f.t.query(api.femaleInterestWorkflow.getReviewAccess,{sessionHash:"other",interestId:f.interestId})).rejects.toThrow("Unauthorized");
 expect(await f.t.run(ctx=>ctx.db.query("matches").take(10))).toEqual([]);expect((await f.t.run(ctx=>ctx.db.query("interestFlows").first()))?.requesterFinalApproval).toBe("pending");
 await f.t.mutation(api.femaleInterestWorkflow.confirm,{sessionHash:"sister",interestId:f.interestId,confirmed:true});expect(await f.t.run(ctx=>ctx.db.query("matches").take(10))).toHaveLength(0);
 await f.t.mutation(api.femaleInterestWorkflow.brotherFinal,{sessionHash:"brother",interestId:f.interestId,approved:true});expect(await f.t.run(ctx=>ctx.db.query("matches").take(10))).toHaveLength(1);
});
for(const status of [429,500,400])test("sister provider retry stable payload/key "+status,async()=>{
 const f=await prepared();await accept(f);const provider=vi.fn().mockResolvedValueOnce(new Response("{}",{status})).mockResolvedValue(new Response("{}",{status:200}));vi.stubGlobal("fetch",provider);
 await f.t.action(internal.femaleWorkflowDelivery.drain,{});const [row]=await rows(f);if(status===400)await f.t.mutation(api.femaleInterestWorkflow.retryDelivery,{adminSecret,deliveryId:row._id});
 await f.t.run(ctx=>ctx.db.patch(row._id,{nextAttemptAt:0,providerCooldownUntil:0}));await f.t.action(internal.femaleWorkflowDelivery.drain,{});expect(provider).toHaveBeenCalledTimes(2);expect(provider.mock.calls[1][1].body).toBe(provider.mock.calls[0][1].body);expect(provider.mock.calls[1][1].headers["Idempotency-Key"]).toBe(row.key);
});
for(const invalid of ["revoked","expired","reset","closed","recipient","email","unapproved","confirmed","transition"] as const)test("pre-provider suppresses "+invalid,async()=>{
 const f=await prepared();await accept(f);const [row]=await f.t.mutation(internal.femaleWorkflowDelivery.claim,{});
 if(invalid==="revoked")await f.t.mutation(api.femaleInterestWorkflow.revokeReview,{adminSecret,interestId:f.interestId});if(invalid==="confirmed")await f.t.mutation(api.femaleInterestWorkflow.confirm,{sessionHash:"sister",interestId:f.interestId,confirmed:true});
 await f.t.run(async ctx=>{
 if(invalid==="expired"||invalid==="transition"){const i=(await ctx.db.get(f.interestId))!;await ctx.db.patch(i._id,{femaleWorkflow:{...i.femaleWorkflow!,...(invalid==="expired"?{reviewExpiresAt:Date.now()-1}:{brotherAcceptedAt:Date.now()+1})}});}
 if(invalid==="reset")await ctx.db.patch(f.interestId,{testReset:{at:Date.now(),reason:"synthetic",actor:"admin"}});if(invalid==="closed")await ctx.db.patch(f.interestId,{status:"closed"});if(invalid==="recipient")await ctx.db.patch(row._id,{recipientId:f.brother});if(invalid==="email")await ctx.db.patch(f.sister,{email:"changed@example.com"});if(invalid==="unapproved")await ctx.db.patch(f.sister,{status:"rejected"});
 });expect(await f.t.mutation(internal.femaleWorkflowDelivery.markAttempt,{id:row._id,attempt:row.attempts})).toBe(false);expect((await f.t.run(ctx=>ctx.db.get(row._id)))?.status).toBe("cancelled");
});
test("no historical promotion, immutable separate boundary and unrelated rows untouched",async()=>{
 const f=await prepared(false);await accept(f);const [old]=await rows(f);expect(old.status).toBe("failed");const at=await f.t.mutation(internal.femaleWorkflowDelivery.activateSisterConfirmation,{});vi.spyOn(Date,"now").mockReturnValue(Number(at)+1);expect(await f.t.mutation(internal.femaleWorkflowDelivery.activateSisterConfirmation,{})).toBe(at);
 await expect(f.t.mutation(api.settings.set,{adminSecret,key:"sisterConfirmationEmailActivatedAt",value:"1"})).rejects.toThrow("immutable");await accept(f);await expect(f.t.mutation(api.femaleInterestWorkflow.retryDelivery,{adminSecret,deliveryId:old._id})).rejects.toThrow("activation");
 const before=await f.t.run(ctx=>ctx.db.query("femaleWorkflowDeliveries").take(100));const provider=vi.fn();vi.stubGlobal("fetch",provider);await f.t.action(internal.femaleWorkflowDelivery.drain,{});expect(provider).not.toHaveBeenCalled();const after=await f.t.run(ctx=>ctx.db.query("femaleWorkflowDeliveries").take(100));if(productionMode==="sister-confirmation-production")expect(after).toEqual(before);else {expect(after.filter(r=>r.kind==="sister_confirmation")).toEqual(before.filter(r=>r.kind==="sister_confirmation"));expect(after.find(r=>r.kind==="brother_review")?.status).toBe("failed");}expect(await f.t.query(api.settings.get,{adminSecret,key:"brotherReviewEmailActivatedAt"})).toBe(null);
});
test("changed email after ambiguous provider attempt cannot replay frozen recipient",async()=>{
 const f=await prepared();await accept(f);const provider=vi.fn().mockRejectedValue(Error("transport"));vi.stubGlobal("fetch",provider);await f.t.action(internal.femaleWorkflowDelivery.drain,{});const [row]=await rows(f);
 await f.t.run(async ctx=>{await ctx.db.patch(f.sister,{email:"new@example.com"});await ctx.db.patch(row._id,{nextAttemptAt:0});});await f.t.action(internal.femaleWorkflowDelivery.drain,{});expect(provider).toHaveBeenCalledTimes(1);expect((await rows(f))[0].status).toBe("cancelled");
});

});
