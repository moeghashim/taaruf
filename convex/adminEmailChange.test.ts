import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
const adminSecret = "synthetic-admin-test";
process.env.ATTENDANCE_ADMIN_SECRET = adminSecret;
const base = { name: "Synthetic", age: 30, gender: "male" as const, maritalStatus: "single", education: "College", job: "Engineer", phone: "5550100", status: "approved" as const, publicApplicantNumber: 123, createdAt: 1, profileAccessToken: "old-profile-link", profileAccessTokenIssuedAt: 1 };
async function setup() {
 const t = convexTest(schema, modules);
 const id = await t.run(ctx => ctx.db.insert("registrations", { ...base, email: "old@example.invalid" }));
 const args = { adminSecret, registrationId: id, expectedOldEmail: "old@example.invalid", newEmail: " New@Example.Invalid ", reason: "Member requested correction" };
 return { t, id, args };
}
test("atomic change preserves profile, revokes old credentials and allows only new-email login", async () => {
 const {t,id,args} = await setup();
 const before = await t.run(ctx => ctx.db.get(id));
 await t.mutation(api.applicantAuth.createLoginToken,{adminSecret,email:args.expectedOldEmail,tokenHash:"pending-token"});
 await t.mutation(api.applicantAuth.createLoginToken,{adminSecret,email:args.expectedOldEmail,tokenHash:"claimed-token"});
 await t.mutation(api.applicantAuth.claimLoginToken,{adminSecret,tokenHash:"claimed-token",sessionHash:"old-session"});
 expect(await t.query(api.applicantAuth.getSession,{adminSecret,sessionHash:"old-session"})).not.toBeNull();
 expect(await t.mutation(api.adminEmailChange.change,args)).toEqual({email:"new@example.invalid"});
 const after = await t.run(ctx=>ctx.db.get(id));
 const preserved = { ...before! }; delete preserved.profileAccessToken; delete preserved.profileAccessTokenIssuedAt;
 expect(after).toEqual({...preserved,email:"new@example.invalid",emailCanonical:"new@example.invalid"});
 expect(await t.query(api.applicantAuth.getSession,{adminSecret,sessionHash:"old-session"})).toBeNull();
 expect(await t.mutation(api.applicantAuth.touchSession,{adminSecret,sessionHash:"old-session"})).toBe(false);
 expect(await t.mutation(api.applicantAuth.claimLoginToken,{adminSecret,tokenHash:"pending-token",sessionHash:"stolen"})).toBeNull();
 expect(await t.mutation(api.applicantAuth.createLoginToken,{adminSecret,email:args.expectedOldEmail,tokenHash:"old-again"})).toBeNull();
 expect(await t.mutation(api.applicantAuth.createLoginToken,{adminSecret,email:"new@example.invalid",tokenHash:"new-token"})).toMatchObject({registrationId:id});
 expect(await t.mutation(api.applicantAuth.claimLoginToken,{adminSecret,tokenHash:"new-token",sessionHash:"new-session"})).toMatchObject({registrationId:id});
 expect(await t.query(api.applicantAuth.getSession,{adminSecret,sessionHash:"new-session"})).not.toBeNull();
 const audits = await t.run(ctx=>ctx.db.query("adminEmailChangeAudits").collect());
 expect(audits).toHaveLength(1); expect(audits[0]).toMatchObject({registrationId:id,oldEmail:args.expectedOldEmail,newEmail:"new@example.invalid",actor:"authenticated_shared_admin"});
});
test("unauthorized, invalid, unchanged and stale requests never mutate",async()=>{
 const {t,id,args}=await setup(); const before=await t.run(ctx=>ctx.db.get(id));
 for(const override of [{adminSecret:"wrong"},{newEmail:"bad address"},{newEmail:"old@example.invalid"},{expectedOldEmail:"stale@example.invalid"},{reason:""}]) await expect(t.mutation(api.adminEmailChange.change,{...args,...override})).rejects.toThrow();
 expect(await t.run(ctx=>ctx.db.get(id))).toEqual(before);
 expect(await t.run(ctx=>ctx.db.query("adminEmailChangeAudits").collect())).toEqual([]);
});
test("duplicate canonical and legacy mixed-case addresses rejected",async()=>{
 const {t,args}=await setup();
 await t.run(ctx=>ctx.db.insert("registrations",{...base,email:" NEW@example.INVALID ",publicApplicantNumber:124}));
 await expect(t.mutation(api.adminEmailChange.change,args)).rejects.toThrow("Email already registered");
});
test("stale competing edits cannot overwrite winner; one audit only",async()=>{
 const {t,args}=await setup();
 const results=await Promise.allSettled([t.mutation(api.adminEmailChange.change,args),t.mutation(api.adminEmailChange.change,{...args,newEmail:"other@example.invalid"})]);
 expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
 expect(await t.run(ctx=>ctx.db.query("adminEmailChangeAudits").collect())).toHaveLength(1);
});
test("two profiles cannot claim the same normalized address",async()=>{
 const {t,args}=await setup();
 const other=await t.run(ctx=>ctx.db.insert("registrations",{...base,email:"other@example.invalid",publicApplicantNumber:124}));
 const results=await Promise.allSettled([t.mutation(api.adminEmailChange.change,args),t.mutation(api.adminEmailChange.change,{...args,registrationId:other,expectedOldEmail:"other@example.invalid"})]);
 expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
});

test("stale email delivery cannot issue a fresh profile capability after email change",async()=>{
 const {t,id,args}=await setup();
 await t.mutation(api.adminEmailChange.change,args);
 expect(await t.query(api.registrations.getByProfileAccessToken,{token:"old-profile-link"})).toBeNull();
 await expect(t.mutation(api.registrations.ensureProfileAccessToken,{adminSecret,id,token:"fresh-to-stale",expectedEmail:args.expectedOldEmail})).rejects.toThrow("Email changed");
 expect(await t.query(api.registrations.getByProfileAccessToken,{token:"fresh-to-stale"})).toBeNull();
 await t.mutation(api.registrations.ensureProfileAccessToken,{adminSecret,id,token:"fresh-to-new",expectedEmail:"new@example.invalid"});
 expect(await t.query(api.registrations.getByProfileAccessToken,{token:"fresh-to-new"})).not.toBeNull();
 await t.mutation(api.adminEmailChange.change,{...args,expectedOldEmail:"new@example.invalid",newEmail:"third@example.invalid"});
 expect(await t.query(api.registrations.getByProfileAccessToken,{token:"fresh-to-new"})).toBeNull();
});
