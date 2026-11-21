import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { BODY, SUBJECT } from "./approvalWelcomeNotice";
const secret = "synthetic-admin";
beforeEach(() => {
 vi.useFakeTimers(); vi.setSystemTime(1800000000000);
 vi.stubEnv("ATTENDANCE_ADMIN_SECRET", secret);
 vi.stubEnv("APPROVAL_WELCOME_NOTICE_APPROVED", "true");
 vi.stubEnv("APPROVAL_WELCOME_NOTICE_DELIVERY", "live");
 vi.stubEnv("CONVEX_CLOUD_URL", "https://clever-meerkat-940.convex.cloud");
 vi.stubEnv("APPROVAL_WELCOME_NOTICE_RESEND_API_KEY", "synthetic");
 vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({id:"provider"}),{status:200})));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
async function setup(activate = true, status: "pending" | "approved" = "pending") {
 const t = convexTest(schema, modules);
 const id = await t.run(ctx => ctx.db.insert("registrations", { name: "Synthetic", email: "synthetic@example.invalid", age: 30, gender: "male", maritalStatus: "single", education: "Test", job: "Test", phone: "000", status, createdAt: 1 }));
 if (activate) await t.mutation(internal.approvalWelcomeNotice.activate, {});
 const update = (status: "pending" | "approved" | "rejected") => t.mutation(api.registrations.updateStatus, { id, status, adminSecret: secret });
 const rows = () => t.run(ctx => ctx.db.query("approvalWelcomeNotices").collect());
 const drain = () => t.action(internal.approvalWelcomeNotice.drain, {});
 return { t, id, update, rows, drain };
}
test("normal approval sends exact copy once across concurrent saves and workers, never on reapproval", async()=>{
 const {t,id,update,rows,drain}=await setup();
 await expect(t.mutation(api.registrations.updateStatus,{id,status:"approved"})).rejects.toThrow("Unauthorized");
 await Promise.all([update("approved"),update("approved")]); await update("approved");
 await Promise.all([drain(),drain()]); expect(fetch).toHaveBeenCalledTimes(1);
 const payload=JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
 expect(payload).toEqual({from:"1Plus1 Match <contact@1plus1match.com>",reply_to:"1plus1@plus1htx.org",to:["synthetic@example.invalid"],subject:SUBJECT,text:BODY});
 expect(SUBJECT).toBe("Your 1 Plus 1 application has been approved");
 expect((await rows())[0]).toMatchObject({state:"accepted",providerId:"provider"});
 await update("pending");await update("approved");await drain();expect(fetch).toHaveBeenCalledTimes(1);
 expect(await t.run(ctx=>ctx.db.query("eventRegistrations").collect())).toHaveLength(0);
 expect(await t.run(ctx=>ctx.db.query("femaleWorkflowDeliveries").collect())).toHaveLength(0);
});
test("activation never backfills existing approvals or disabled transitions",async()=>{
 const {t,update,rows,drain}=await setup(false);await update("approved");
 await t.mutation(internal.approvalWelcomeNotice.activate,{});await update("approved");await drain();expect(await rows()).toHaveLength(0);
 const old=await setup(true,"approved");await old.update("approved");await old.drain();expect(await old.rows()).toHaveLength(0);expect(fetch).not.toHaveBeenCalled();
});
test("pending/signup and rejected transitions have no welcome effect",async()=>{const {update,rows,drain}=await setup();await drain();await update("pending");await update("rejected");await drain();expect(await rows()).toHaveLength(0);expect(fetch).not.toHaveBeenCalled();});
test.each(["preview","disabled","delivery"])("%s configuration fails closed",async kind=>{
 const {t,update,rows,drain}=await setup(false);
 if(kind==="preview")vi.stubEnv("CONVEX_CLOUD_URL","https://isolated.convex.cloud");
 if(kind==="disabled")vi.stubEnv("APPROVAL_WELCOME_NOTICE_APPROVED","false");
 if(kind==="delivery")vi.stubEnv("APPROVAL_WELCOME_NOTICE_DELIVERY","");
 await expect(t.mutation(internal.approvalWelcomeNotice.activate,{})).rejects.toThrow();await update("approved");await drain();expect(await rows()).toHaveLength(0);expect(fetch).not.toHaveBeenCalled();
});
test.each(["archived","retired","suppressed","changed","reversed","deleted"])("dispatch rechecks %s eligibility",async kind=>{
 const {t,id,update,rows,drain}=await setup();await update("approved");
 await t.run(async ctx=>{if(kind==="deleted")await ctx.db.delete(id);else await ctx.db.patch(id,kind==="archived"?{archivedAt:Date.now()}:kind==="retired"?{securityRetiredAt:Date.now()}:kind==="suppressed"?{approvalWelcomeSuppressedAt:Date.now()}:kind==="changed"?{email:"other@example.invalid"}:{status:"pending"});});
 await drain();expect(fetch).not.toHaveBeenCalled();expect((await rows())[0].state).toBe("cancelled");
});
test("cancelled welcome never requeues on reapproval",async()=>{const {update,rows,drain}=await setup();await update("approved");await update("pending");await update("approved");await drain();expect(fetch).not.toHaveBeenCalled();expect((await rows())[0].state).toBe("cancelled");});
test("provider failure does not roll back approval or falsely record sent; retry freezes key and payload",async()=>{
 const {t,id,update,rows,drain}=await setup();vi.mocked(fetch).mockRejectedValueOnce(new Error("timeout"));await update("approved");await drain();
 expect(await t.run(ctx=>ctx.db.get(id))).toMatchObject({status:"approved"});const row=(await rows())[0];expect(row).toMatchObject({state:"pending",attempts:1});expect(row.providerId).toBeUndefined();
 vi.setSystemTime(row.nextAttemptAt);await drain();expect((await rows())[0].state).toBe("accepted");
 const calls=vi.mocked(fetch).mock.calls;expect(calls[0][1]!.body).toBe(calls[1][1]!.body);expect(calls[0][1]!.headers).toEqual(calls[1][1]!.headers);
});
test.each([400,429,500])("provider %s never falsely records acceptance",async code=>{const {update,rows,drain}=await setup();vi.mocked(fetch).mockResolvedValue(new Response("error",{status:code,headers:{"Retry-After":"600"}}));await update("approved");await drain();const row=(await rows())[0];expect(row.providerId).toBeUndefined();expect(row.state).toBe(code===400?"needs_reconciliation":"pending");expect(row.nextAttemptAt).toBeGreaterThanOrEqual(Date.now()+600000);});
test("abandoned attempt uses same key inside window and stops before provider key expiry",async()=>{const {t,update,rows,drain}=await setup();await update("approved");const first=await t.mutation(internal.approvalWelcomeNotice.claim,{});expect(first).not.toBeNull();vi.setSystemTime(Date.now()+23*3600000);await drain();expect(fetch).not.toHaveBeenCalled();expect((await rows())[0].state).toBe("needs_reconciliation");});
test("activation is immutable and stale rows cannot send",async()=>{const {t,id,rows,drain}=await setup();await expect(t.mutation(api.settings.set,{adminSecret:secret,key:"approvalWelcomeNoticeActivatedAt",value:"1"})).rejects.toThrow("immutable");await t.run(ctx=>ctx.db.insert("approvalWelcomeNotices",{registrationId:id,email:"synthetic@example.invalid",state:"pending",attempts:0,createdAt:1,updatedAt:1,notBefore:1,nextAttemptAt:1}));await drain();expect(fetch).not.toHaveBeenCalled();expect((await rows())[0].state).toBe("cancelled");});
test("archive and restore fence queued welcome permanently",async()=>{const {t,id,update,rows,drain}=await setup();await update("approved");const a=await t.mutation(api.archive.archiveAdmin,{adminSecret:secret,registrationId:id,expectedArchivedAt:null,confirm:true});await t.mutation(api.archive.restoreAdmin,{adminSecret:secret,registrationId:id,expectedArchivedAt:a.archivedAt,confirm:true});await drain();expect(fetch).not.toHaveBeenCalled();expect((await rows())[0].state).toBe("cancelled");});
