import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { BODY, SUBJECT } from "./profileRejectionNotice";
const secret = "synthetic-admin";
beforeEach(() => { vi.stubEnv("ATTENDANCE_ADMIN_SECRET", secret); vi.stubEnv("PROFILE_REJECTION_NOTICE_APPROVED", "true"); vi.stubEnv("PROFILE_REJECTION_NOTICE_RESEND_API_KEY", "synthetic"); vi.stubEnv("PROFILE_REJECTION_NOTICE_FROM", "Test <test@example.invalid>"); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
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
 await update("rejected"); expect(await rows()).toHaveLength(1);
 const row = await t.mutation(internal.profileRejectionNotice.claim,{});
 expect(row?.payload).toEqual({from:"Test <test@example.invalid>",to:["synthetic@example.invalid"],subject:SUBJECT,text:BODY});
 expect(SUBJECT).toBe("Your 1 Plus 1 Application");
 expect(BODY).not.toMatch(/background|event|november/i);
 expect(await t.mutation(internal.profileRejectionNotice.claim,{})).toBeNull();
});
test("activation never sweeps existing rejected profiles or replays disabled transitions", async () => {
 const {t,update,rows} = await setup(false);
 await update("rejected"); await t.mutation(internal.profileRejectionNotice.activate,{}); await update("rejected");
 expect(await rows()).toHaveLength(0);
 const old = await setup(true,"rejected"); await old.update("rejected"); expect(await old.rows()).toHaveLength(0);
});
test("reversal cancels pending notice permanently, including re-rejection", async () => {
 const {t,update,rows} = await setup(); await update("rejected"); await update("approved"); await update("rejected");
 expect((await rows())[0].state).toBe("cancelled"); expect(await t.mutation(internal.profileRejectionNotice.claim,{})).toBeNull();
});
test.each(["deleted","email changed","reversed"])("claim rechecks %s profile", async change => {
 const {t,id,update,rows} = await setup(); await update("rejected");
 await t.run(async ctx => { if(change === "deleted") await ctx.db.delete(id); else await ctx.db.patch(id, change === "email changed" ? {email:"other@example.invalid"} : {status:"approved"}); });
 expect(await t.mutation(internal.profileRejectionNotice.claim,{})).toBeNull(); expect((await rows())[0].state).toBe("cancelled");
});
test("ambiguous network result retries immutable payload/key, then records provider acceptance", async () => {
 const {t,update,rows} = await setup(); await update("rejected");
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
 const {t,update,rows}=await setup(); await update("rejected"); const row=(await rows())[0];
 await t.run(ctx=>ctx.db.patch(row._id,reason==="expired"?{firstAttemptAt:Date.now()-23*3600000}:{attempts:6}));
 expect(await t.mutation(internal.profileRejectionNotice.claim,{})).toBeNull(); expect((await rows())[0].state).toBe("needs_reconciliation");
});
test("disabled dedicated config does not activate or send; other workflows remain untouched", async()=>{
 const {t,update,rows}=await setup(false); vi.stubEnv("PROFILE_REJECTION_NOTICE_APPROVED","");
 await expect(t.mutation(internal.profileRejectionNotice.activate,{})).rejects.toThrow(); await update("rejected"); expect(await rows()).toHaveLength(0);
 expect(await t.mutation(internal.profileRejectionNotice.claim,{})).toBeNull();
 expect(await t.run(ctx=>ctx.db.query("femaleWorkflowDeliveries").collect())).toHaveLength(0);
});
test("late acceptance after reversal is audited rather than retried", async()=>{
 const {t,update,rows}=await setup(); await update("rejected"); const row=await t.mutation(internal.profileRejectionNotice.claim,{}); await update("approved");
 await t.mutation(internal.profileRejectionNotice.finish,{id:row!.id,attempt:row!.attempt,providerId:"accepted-before-reversal"});
 expect((await rows())[0]).toMatchObject({state:"accepted",providerId:"accepted-before-reversal"});
});
test("generic settings cannot forge activation; invalid stored boundary fails closed",async()=>{
 const {t,update,rows}=await setup(false);
 await expect(t.mutation(api.settings.set,{adminSecret:secret,key:"profileRejectionNoticeActivatedAt",value:"1"})).rejects.toThrow("immutable");
 await t.run(ctx=>ctx.db.insert("settings",{key:"profileRejectionNoticeActivatedAt",value:"garbage"}));
 await update("rejected"); expect(await rows()).toHaveLength(0);
});
test("ambiguous reversal requires reconciliation; stale success remains evidence",async()=>{
 const {t,update,rows}=await setup(); await update("rejected"); const first=await t.mutation(internal.profileRejectionNotice.claim,{});
 await t.run(ctx=>ctx.db.patch(first!.id,{nextAttemptAt:0})); const second=await t.mutation(internal.profileRejectionNotice.claim,{}); expect(second!.attempt).toBe(2);
 await update("approved"); expect((await rows())[0].state).toBe("needs_reconciliation");
 await t.mutation(internal.profileRejectionNotice.finish,{id:first!.id,attempt:first!.attempt,providerId:"late-evidence"});
 expect((await rows())[0].providerId).toBe("late-evidence");
});
