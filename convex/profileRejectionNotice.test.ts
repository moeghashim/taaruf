import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { BODY, SUBJECT, GRACE_MS } from "./profileRejectionNotice";
const secret = "synthetic-admin";
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1800000000000); vi.stubEnv("ATTENDANCE_ADMIN_SECRET", secret); vi.stubEnv("PROFILE_REJECTION_NOTICE_APPROVED", "true"); vi.stubEnv("PROFILE_REJECTION_NOTICE_RESEND_API_KEY", "synthetic"); vi.stubEnv("PROFILE_REJECTION_NOTICE_FROM", "Test <test@example.invalid>"); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
async function setup(activate = true, status: "pending" | "rejected" = "pending") {
 const t = convexTest(schema, modules);
 const id = await t.run(ctx => ctx.db.insert("registrations", { name: "Synthetic", email: "synthetic@example.invalid", age: 30, gender: "male", maritalStatus: "single", education: "Test", job: "Test", phone: "000", status, createdAt: 1 }));
 if (activate) await t.mutation(internal.profileRejectionNotice.activate, {});
 const update = (status: "pending" | "approved" | "rejected") => t.mutation(api.registrations.updateStatus, { id, status, adminSecret: secret });
 const rows = () => t.run(ctx => ctx.db.query("profileRejectionNotices").collect());
 return { t, id, update, rows };
}
test("authenticated whole-profile transition atomically creates exactly one notice despite repeated/concurrent saves", async () => {
 const {t,id,update,rows} = await setup();
 await expect(t.mutation(api.registrations.updateStatus,{id,status:"rejected"})).rejects.toThrow("Unauthorized");
 expect(await rows()).toHaveLength(0);
 await Promise.all([update("rejected"),update("rejected")]);
 await update("rejected"); vi.setSystemTime(Date.now() + GRACE_MS); expect(await rows()).toHaveLength(1);
 const row = await t.mutation(internal.profileRejectionNotice.claim,{});
 expect(row?.payload).toEqual({from:"Test <test@example.invalid>",to:["synthetic@example.invalid"],subject:SUBJECT,text:BODY});
 expect(SUBJECT).toBe("Your 1 Plus 1 Application");
 expect(BODY).not.toMatch(/background|event|november/i);
 expect(await t.mutation(internal.profileRejectionNotice.claim,{})).toBeNull();
});
test("activation never sweeps existing rejected profiles or replays disabled transitions", async () => {
 const {t,update,rows} = await setup(false);
 await update("rejected"); vi.setSystemTime(Date.now() + GRACE_MS); await t.mutation(internal.profileRejectionNotice.activate,{}); await update("rejected"); vi.setSystemTime(Date.now() + GRACE_MS);
 expect(await rows()).toHaveLength(0);
 const old = await setup(true,"rejected"); await old.update("rejected"); expect(await old.rows()).toHaveLength(0);
});
test("unsent cancellation allows a fresh rejection grace period", async () => {
 const {t,update,rows} = await setup(); await update("rejected"); vi.setSystemTime(Date.now() + GRACE_MS); await update("approved"); await update("rejected"); vi.setSystemTime(Date.now() + GRACE_MS);
 expect((await rows())[0].state).toBe("pending"); expect(await t.mutation(internal.profileRejectionNotice.claim,{})).not.toBeNull();
});
test.each(["deleted","email changed","reversed"])("claim rechecks %s profile", async change => {
 const {t,id,update,rows} = await setup(); await update("rejected"); vi.setSystemTime(Date.now() + GRACE_MS);
 await t.run(async ctx => { if(change === "deleted") await ctx.db.delete(id); else await ctx.db.patch(id, change === "email changed" ? {email:"other@example.invalid"} : {status:"approved"}); });
 expect(await t.mutation(internal.profileRejectionNotice.claim,{})).toBeNull(); expect((await rows())[0].state).toBe("cancelled");
});
test("ambiguous network result retries immutable payload/key, then records provider acceptance", async () => {
 const {t,update,rows} = await setup(); await update("rejected"); vi.setSystemTime(Date.now() + GRACE_MS);
 const fetcher = vi.fn().mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce(new Response(JSON.stringify({id:"synthetic-provider-id"}),{status:200})); vi.stubGlobal("fetch",fetcher);
 await t.action(internal.profileRejectionNotice.drain,{});
 let row=(await rows())[0]; expect(row.state).toBe("pending");
 await t.run(ctx=>ctx.db.patch(row._id,{nextAttemptAt:0})); vi.stubEnv("PROFILE_REJECTION_NOTICE_FROM","changed@example.invalid");
 await t.action(internal.profileRejectionNotice.drain,{}); row=(await rows())[0];
 expect(row.state).toBe("accepted"); expect(row.providerId).toBe("synthetic-provider-id");
 expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body);
 expect(fetcher.mock.calls[0][1].headers["Idempotency-Key"]).toBe(fetcher.mock.calls[1][1].headers["Idempotency-Key"]);
 await t.action(internal.profileRejectionNotice.drain,{}); expect(fetcher).toHaveBeenCalledTimes(2);
});
test.each(["expired","exhausted"])("%s attempts stop for manual reconciliation, never a fresh send", async reason => {
 const {t,update,rows}=await setup(); await update("rejected"); vi.setSystemTime(Date.now() + GRACE_MS); const row=(await rows())[0];
 await t.run(ctx=>ctx.db.patch(row._id,reason==="expired"?{firstAttemptAt:Date.now()-23*3600000}:{attempts:6}));
 expect(await t.mutation(internal.profileRejectionNotice.claim,{})).toBeNull(); expect((await rows())[0].state).toBe("needs_reconciliation");
});
test("disabled dedicated config does not activate or send; other workflows remain untouched", async()=>{
 const {t,update,rows}=await setup(false); vi.stubEnv("PROFILE_REJECTION_NOTICE_APPROVED","");
 await expect(t.mutation(internal.profileRejectionNotice.activate,{})).rejects.toThrow(); await update("rejected"); vi.setSystemTime(Date.now() + GRACE_MS); expect(await rows()).toHaveLength(0);
 expect(await t.mutation(internal.profileRejectionNotice.claim,{})).toBeNull();
 expect(await t.run(ctx=>ctx.db.query("femaleWorkflowDeliveries").collect())).toHaveLength(0);
});
test("late acceptance after reversal is audited rather than retried", async()=>{
 const {t,update,rows}=await setup(); await update("rejected"); vi.setSystemTime(Date.now() + GRACE_MS); const row=await t.mutation(internal.profileRejectionNotice.claim,{}); await update("approved");
 await t.mutation(internal.profileRejectionNotice.finish,{id:row!.id,attempt:row!.attempt,providerId:"accepted-before-reversal"});
 expect((await rows())[0]).toMatchObject({state:"accepted",providerId:"accepted-before-reversal"});
});
test("generic settings cannot forge activation; invalid stored boundary fails closed",async()=>{
 const {t,update,rows}=await setup(false);
 await expect(t.mutation(api.settings.set,{adminSecret:secret,key:"profileRejectionNoticeActivatedAt",value:"1"})).rejects.toThrow("immutable");
 await t.run(ctx=>ctx.db.insert("settings",{key:"profileRejectionNoticeActivatedAt",value:"garbage"}));
 await update("rejected"); vi.setSystemTime(Date.now() + GRACE_MS); expect(await rows()).toHaveLength(0);
});
test("ambiguous reversal requires reconciliation; stale success remains evidence",async()=>{
 const {t,update,rows}=await setup(); await update("rejected"); vi.setSystemTime(Date.now() + GRACE_MS); const first=await t.mutation(internal.profileRejectionNotice.claim,{});
 await t.run(ctx=>ctx.db.patch(first!.id,{nextAttemptAt:0})); const second=await t.mutation(internal.profileRejectionNotice.claim,{}); expect(second!.attempt).toBe(2);
 await update("approved"); expect((await rows())[0].state).toBe("needs_reconciliation");
 await t.mutation(internal.profileRejectionNotice.finish,{id:first!.id,attempt:first!.attempt,providerId:"late-evidence"});
 expect((await rows())[0].providerId).toBe("late-evidence");
});
test("non-JSON rate limit preserves provider Retry-After",async()=>{
 const {t,update,rows}=await setup(); await update("rejected"); vi.setSystemTime(Date.now() + GRACE_MS);
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response("rate limited",{status:429,headers:{"Retry-After":"600"}})));
 const before=Date.now(); await t.action(internal.profileRejectionNotice.drain,{});
 expect((await rows())[0]).toMatchObject({state:"pending",attempts:1});
 expect((await rows())[0].nextAttemptAt).toBeGreaterThanOrEqual(before+600000);
});

test("durable deadline survives worker reload, duplicate saves, stale wakeups and concurrent claims", async () => {
 const {t, update, rows} = await setup();
 const start = Date.now(); await update("rejected");
 expect((await rows())[0].notBefore).toBe(start + GRACE_MS);
 vi.setSystemTime(start + GRACE_MS - 1);
 await Promise.all([update("rejected"), update("rejected")]);
 expect((await rows())[0].notBefore).toBe(start + GRACE_MS);
 expect(await t.mutation(internal.profileRejectionNotice.claim, {})).toBeNull();
 // A fresh worker invocation reads only persisted state, not an in-memory timer.
 vi.resetModules();
 vi.setSystemTime(start + GRACE_MS);
 const claims = await Promise.all([t.mutation(internal.profileRejectionNotice.claim, {}), t.mutation(internal.profileRejectionNotice.claim, {})]);
 expect(claims.filter(Boolean)).toHaveLength(1);
 expect((await rows())[0].attempts).toBe(1);
});
test("reversal at boundary fences old deadline and fresh re-rejection gets full grace", async () => {
 const {t, update, rows} = await setup(); const start = Date.now();
 await update("rejected"); vi.setSystemTime(start + GRACE_MS - 1);
 await update("approved"); expect((await rows())[0].state).toBe("cancelled");
 await Promise.all([update("rejected"), update("rejected")]);
 const deadline = start + 2 * GRACE_MS - 1;
 expect((await rows())[0].notBefore).toBe(deadline);
 vi.setSystemTime(start + GRACE_MS);
 expect(await t.mutation(internal.profileRejectionNotice.claim, {})).toBeNull();
 // Even an obsolete scheduled due time cannot bypass the independent not-before guard.
 const row = (await rows())[0]; await t.run(ctx => ctx.db.patch(row._id, {nextAttemptAt: 0}));
 vi.setSystemTime(deadline - 1); expect(await t.mutation(internal.profileRejectionNotice.claim, {})).toBeNull();
 vi.setSystemTime(deadline); expect(await t.mutation(internal.profileRejectionNotice.claim, {})).not.toBeNull();
 expect(await rows()).toHaveLength(1);
});
test.each(["accepted", "ambiguous"])("%s delivery is never reset by reversal/re-rejection", async kind => {
 const {t, update, rows} = await setup(); await update("rejected"); vi.setSystemTime(Date.now() + GRACE_MS);
 const claim = await t.mutation(internal.profileRejectionNotice.claim, {});
 await t.mutation(internal.profileRejectionNotice.finish, {id: claim!.id, attempt: claim!.attempt, ...(kind === "accepted" ? {providerId: "synthetic-accepted"} : {})});
 await update("approved"); const before = (await rows())[0]; await update("rejected");
 vi.setSystemTime(Date.now() + 2 * GRACE_MS);
 expect(await t.mutation(internal.profileRejectionNotice.claim, {})).toBeNull();
 expect((await rows())[0]).toEqual(before);
});
test("legacy unattempted notices never send retroactively and status requires admin", async () => {
 const {t, id, update, rows} = await setup(); await update("rejected");
 const row = (await rows())[0]; await t.run(ctx => ctx.db.patch(row._id, {notBefore: undefined, nextAttemptAt: 0}));
 expect(await t.mutation(internal.profileRejectionNotice.claim, {})).toBeNull();
 expect((await rows())[0].state).toBe("cancelled");
 await expect(t.query(api.profileRejectionNotice.status, {registrationId: id})).rejects.toThrow("Unauthorized");
 expect(await t.query(api.profileRejectionNotice.status, {registrationId: id, adminSecret: secret})).toEqual({state: "cancelled", notBefore: null, attempted: false});
});

// Shared login-link transport is authorized; rejection authorization is independent.
test("shared transactional credential uses existing sender and frozen retries", async () => {
 vi.stubEnv("PROFILE_REJECTION_NOTICE_RESEND_API_KEY", "");
 vi.stubEnv("PROFILE_REJECTION_NOTICE_FROM", "");
 vi.stubEnv("RESEND_API_KEY", "synthetic-shared");
 const {t,update,rows}=await setup(); await update("rejected");
 vi.setSystemTime(Date.now()+GRACE_MS);
 const fetcher=vi.fn().mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce(new Response(JSON.stringify({id:"shared-accepted"}),{status:200}));
 vi.stubGlobal("fetch",fetcher);
 await t.action(internal.profileRejectionNotice.drain,{});
 expect(fetcher.mock.calls[0][1].headers.Authorization).toBe("Bearer synthetic-shared");
 expect(JSON.parse(fetcher.mock.calls[0][1].body).from).toBe("1Plus1 Match <contact@1plus1match.com>");
 const row=(await rows())[0];await t.run(ctx=>ctx.db.patch(row._id,{nextAttemptAt:0}));
 vi.stubEnv("PROFILE_REJECTION_NOTICE_FROM","changed@example.invalid");
 await t.action(internal.profileRejectionNotice.drain,{});
 expect(fetcher.mock.calls[1][1].body).toBe(fetcher.mock.calls[0][1].body);
 expect(fetcher.mock.calls[1][1].headers["Idempotency-Key"]).toBe(fetcher.mock.calls[0][1].headers["Idempotency-Key"]);
});
test.each(["approval", "credential"])("shared transport fails closed without %s", async missing => {
 vi.stubEnv("PROFILE_REJECTION_NOTICE_RESEND_API_KEY", "");vi.stubEnv("PROFILE_REJECTION_NOTICE_FROM", "");
 vi.stubEnv("RESEND_API_KEY",missing==="credential"?"":"synthetic-shared");
 if(missing==="approval")vi.stubEnv("PROFILE_REJECTION_NOTICE_APPROVED", "false");
 const {t,update,rows}=await setup(false);
 await expect(t.mutation(internal.profileRejectionNotice.activate,{})).rejects.toThrow();
 await update("rejected");expect(await rows()).toHaveLength(0);
 expect(await t.mutation(internal.profileRejectionNotice.claim,{})).toBeNull();
});
test("dedicated override remains backwards compatible when shared key exists",async()=>{
 vi.stubEnv("RESEND_API_KEY","synthetic-shared");
 const {t,update}=await setup();await update("rejected");vi.setSystemTime(Date.now()+GRACE_MS);
 const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({id:"override-accepted"}),{status:200}));vi.stubGlobal("fetch",fetcher);
 await t.action(internal.profileRejectionNotice.drain,{});
 expect(fetcher.mock.calls[0][1].headers.Authorization).toBe("Bearer synthetic");
 expect(JSON.parse(fetcher.mock.calls[0][1].body).from).toBe("Test <test@example.invalid>");
});

test.each([undefined, "garbage", "0", "1800000000001"])("claim fails closed with activation %s even for eligible queued rows", async value => {
 const {t,id,rows}=await setup(false,"rejected");
 await t.run(async ctx=>{if(value!==undefined)await ctx.db.insert("settings",{key:"profileRejectionNoticeActivatedAt",value});await ctx.db.insert("profileRejectionNotices",{registrationId:id,email:"synthetic@example.invalid",state:"pending",attempts:0,createdAt:1,updatedAt:1,notBefore:2,nextAttemptAt:2});});
 const before=await rows();const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
 await t.action(internal.profileRejectionNotice.drain,{});expect(fetcher).not.toHaveBeenCalled();expect(await rows()).toEqual(before);
});
test.each([false,true])("preactivation row with grace boundary cannot send (attempted=%s)",async attempted=>{
 const {t,id,rows}=await setup(true,"rejected");const cutoff=Date.now();
 await t.run(ctx=>ctx.db.insert("profileRejectionNotices",{registrationId:id,email:"synthetic@example.invalid",state:attempted?"sending":"pending",attempts:attempted?1:0,firstAttemptAt:attempted?cutoff-1:undefined,createdAt:cutoff-1,updatedAt:cutoff-1,notBefore:cutoff,nextAttemptAt:cutoff}));
 const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);await t.action(internal.profileRejectionNotice.drain,{});
 expect(fetcher).not.toHaveBeenCalled();expect((await rows())[0].state).toBe(attempted?"needs_reconciliation":"cancelled");
 vi.setSystemTime(cutoff+1000);await t.mutation(internal.profileRejectionNotice.activate,{});
 expect(await t.run(async ctx=>(await ctx.db.query("settings").withIndex("by_key",q=>q.eq("key","profileRejectionNoticeActivatedAt")).unique())?.value)).toBe(String(cutoff));
});
