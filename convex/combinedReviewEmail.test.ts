import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
const adminSecret = "synthetic-female-admin";
const hash = "a".repeat(64);
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


async function combined() {
 const f=await fixture(); isolated();vi.stubEnv("FEMALE_WORKFLOW_EMAIL_MODE","brother-sister-review-production");vi.stubEnv("FEMALE_WORKFLOW_PRODUCTION_APPROVED","true");vi.stubEnv("FEMALE_WORKFLOW_PORTAL_URL","https://www.1plus1match.com");return f;
}
test("combined mode is not activation; per-kind cutoffs are independent and immutable",async()=>{
 const f=await combined();expect(await f.t.run(ctx=>ctx.db.query("settings").take(10))).toEqual([]);
 const a=await f.t.mutation(internal.femaleWorkflowDelivery.activateBrotherReview,{});vi.spyOn(Date,"now").mockReturnValue(Number(a)+10);
 expect(await f.t.query(api.settings.get,{adminSecret,key:"sisterConfirmationEmailActivatedAt"})).toBe(null);
 await f.t.mutation(api.femaleInterestWorkflow.createReview,{adminSecret,interestId:f.interestId,reviewTokenHash:hash});
 await f.t.mutation(api.femaleInterestWorkflow.respond,{sessionHash:"brother",interestId:f.interestId,decision:"accept"});
 const old=(await f.t.run(ctx=>ctx.db.query("femaleWorkflowDeliveries").take(10))).find(r=>r.kind==="sister_confirmation")!;expect(old.status).toBe("failed");
 const b=await f.t.mutation(internal.femaleWorkflowDelivery.activateSisterConfirmation,{});expect(Number(b)).toBeGreaterThan(Number(a));expect(await f.t.mutation(internal.femaleWorkflowDelivery.activateBrotherReview,{})).toBe(a);
 await expect(f.t.mutation(api.femaleInterestWorkflow.retryDelivery,{adminSecret,deliveryId:old._id})).rejects.toThrow("activation");
});
test("both kinds coexist, duplicate drains safe, GET sends nothing and only confirm matches",async()=>{
 const f=await combined();const a=await f.t.mutation(internal.femaleWorkflowDelivery.activateBrotherReview,{});await f.t.mutation(internal.femaleWorkflowDelivery.activateSisterConfirmation,{});vi.spyOn(Date,"now").mockReturnValue(Number(a)+100);
 const provider=vi.fn().mockResolvedValue(new Response("{}",{status:200}));vi.stubGlobal("fetch",provider);
 await f.t.mutation(api.femaleInterestWorkflow.createReview,{adminSecret,interestId:f.interestId,reviewTokenHash:hash});
 await f.t.query(api.femaleInterestWorkflow.getReviewAccess,{sessionHash:"brother",interestId:f.interestId});expect(provider).not.toHaveBeenCalled();
 await Promise.all([f.t.action(internal.femaleWorkflowDelivery.drain,{}),f.t.action(internal.femaleWorkflowDelivery.drain,{})]);
 await Promise.all([f.t.mutation(api.femaleInterestWorkflow.respond,{sessionHash:"brother",interestId:f.interestId,decision:"accept"}),f.t.mutation(api.femaleInterestWorkflow.respond,{sessionHash:"brother",interestId:f.interestId,decision:"accept"})]);
 await Promise.all([f.t.action(internal.femaleWorkflowDelivery.drain,{}),f.t.action(internal.femaleWorkflowDelivery.drain,{})]);
 expect(provider).toHaveBeenCalledTimes(2);expect(provider.mock.calls.map(c=>JSON.parse(c[1].body).to[0])).toEqual(["brother@example.com","sister@example.com"]);
 await f.t.query(api.femaleInterestWorkflow.getReviewAccess,{sessionHash:"sister",interestId:f.interestId});expect(provider).toHaveBeenCalledTimes(2);expect(await f.t.run(ctx=>ctx.db.query("matches").take(10))).toEqual([]);
 await f.t.mutation(api.femaleInterestWorkflow.confirm,{sessionHash:"sister",interestId:f.interestId,confirmed:true});expect(await f.t.run(ctx=>ctx.db.query("matches").take(10))).toHaveLength(1);
 await f.t.action(internal.femaleWorkflowDelivery.drain,{});expect(provider).toHaveBeenCalledTimes(2);
});

for(const kind of ["brother_review","sister_confirmation"] as const)for(const change of ["email","sender"] as const)test(kind+" ambiguous attempt cancels stale "+change,async()=>{
 const f=await combined();const a=await f.t.mutation(internal.femaleWorkflowDelivery.activateBrotherReview,{});await f.t.mutation(internal.femaleWorkflowDelivery.activateSisterConfirmation,{});vi.spyOn(Date,"now").mockReturnValue(Number(a)+100);
 await f.t.mutation(api.femaleInterestWorkflow.createReview,{adminSecret,interestId:f.interestId,reviewTokenHash:hash});
 if(kind==="sister_confirmation")await f.t.mutation(api.femaleInterestWorkflow.respond,{sessionHash:"brother",interestId:f.interestId,decision:"accept"});
 const provider=vi.fn().mockRejectedValue(Error("ambiguous"));vi.stubGlobal("fetch",provider);await f.t.action(internal.femaleWorkflowDelivery.drain,{});
 const row=(await f.t.run(ctx=>ctx.db.query("femaleWorkflowDeliveries").take(10))).find(r=>r.kind===kind)!;expect(provider).toHaveBeenCalledTimes(1);
 await f.t.run(async ctx=>{await ctx.db.patch(row._id,{nextAttemptAt:0});if(change==="email")await ctx.db.patch(kind==="brother_review"?f.brother:f.sister,{email:"changed@example.com"});});
 if(change==="sender")vi.stubEnv("FEMALE_WORKFLOW_EMAIL_FROM","changed@example.com");await f.t.action(internal.femaleWorkflowDelivery.drain,{});expect(provider).toHaveBeenCalledTimes(1);expect((await f.t.run(ctx=>ctx.db.get(row._id)))?.status).toBe("cancelled");
});
