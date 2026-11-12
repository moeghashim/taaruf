import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { contactsVisible } from "./contactGate";
import { assertMatchingParticipants } from "./interestRules";
const adminSecret = "retirement-test";
beforeEach(() => vi.stubEnv("ATTENDANCE_ADMIN_SECRET", adminSecret));
afterEach(() => vi.unstubAllEnvs());
const base = { name: "Synthetic", age: 30, maritalStatus: "single", education: "College", job: "Test", phone: "3125550100", gender: "male" as const, email: "source@example.invalid" };
async function fixture() {
 const t = convexTest(schema, modules);
 const ids = await t.run(async ctx => {
  const now = Date.now();
  const source = await ctx.db.insert("registrations", { ...base, publicApplicantNumber: 79, status: "approved", profileCompletionStatus: "completed", createdAt: now, profileAccessToken: "profile" });
  const survivor = await ctx.db.insert("registrations", { ...base, email: "survivor@example.invalid", phone: "3125550200", status: "approved", createdAt: now });
  const recipient = await ctx.db.insert("registrations", { ...base, gender: "female", email: "recipient@example.invalid", phone: "3125550300", status: "approved", createdAt: now });
  await ctx.db.insert("applicantSessions", { registrationId: source, sessionHash: "session", createdAt: now, expiresAt: now + 100000 });
  await ctx.db.insert("applicantLoginTokens", { registrationId: source, tokenHash: "login", createdAt: now, expiresAt: now + 100000 });
  await ctx.db.insert("profileShares", { ownerRegistrationId: source, recipientRegistrationId: recipient, shareToken: "share", includeImages: true, status: "shared", createdAt: now, updatedAt: now });
  return {source, survivor, recipient};
 });
 return {t, ...ids};
}
test("retirement denies old and fresh authentication, upload and share capabilities, even after rollback", async () => {
 const {t, source, survivor} = await fixture();
 expect(await t.query(api.applicantAuth.getSession, {adminSecret, sessionHash:"session"})).not.toBeNull();
 await t.run(ctx => ctx.db.patch(source, {securityRetiredAt: Date.now(), mergedIntoRegistrationId: survivor}));
 for (const rolledBack of [false, true]) {
  if (rolledBack) await t.run(ctx => ctx.db.patch(source, {mergedIntoRegistrationId: undefined}));
  expect(await t.mutation(api.applicantAuth.createLoginToken, {adminSecret, email:" SOURCE@example.invalid ", tokenHash:"fresh"})).toBeNull();
  expect(await t.mutation(api.applicantAuth.claimLoginToken, {adminSecret, tokenHash:"login", sessionHash:"fresh-session"})).toBeNull();
  expect(await t.query(api.applicantAuth.getSession, {adminSecret, sessionHash:"session"})).toBeNull();
  expect(await t.mutation(api.applicantAuth.touchSession, {adminSecret, sessionHash:"session"})).toBe(false);
  expect(await t.query(api.registrations.getByProfileAccessToken, {token:"profile"})).toBeNull();
  expect(await t.query(api.profileShares.getByShareToken, {shareToken:"share"})).toBeNull();
  for (const credential of [{sessionHash:"session"}, {profileToken:"profile"}]) await expect(t.query(api.photoUploads.authorize, {adminSecret,...credential})).rejects.toThrow("Unauthorized");
  for (const query of [api.applicantProfile.getProfile, api.applicantInterests.getDashboard, api.events.getApplicantEvents]) await expect(t.query(query, {sessionHash:"session"})).rejects.toThrow("Unauthorized");
  await expect(t.mutation(api.registrations.setProfileAccessToken,{adminSecret,id:source,token:"new",recoveryOnly:true})).rejects.toThrow("security retired");
  await expect(t.mutation(api.registrations.ensureProfileAccessToken,{adminSecret,id:source,token:"new",expectedEmail:base.email})).rejects.toThrow("security retired");
 }
 expect(await t.mutation(api.applicantAuth.createLoginToken, {adminSecret,email:"survivor@example.invalid",tokenHash:"survivor-login"})).toMatchObject({registrationId:survivor});
 expect(await t.run(async ctx => (await ctx.db.query("applicantSessions").collect()).length)).toBe(1);
});
test("retired source contacts cannot be edited, deleted or reused with a new email or formatted phone", async () => {
 const {t,source,survivor} = await fixture();
 await t.run(ctx => ctx.db.patch(source,{securityRetiredAt:0}));
 for (const contact of [{email:" SOURCE@example.invalid ",phone:"9995550100"},{email:"new@example.invalid",phone:"+1 (312) 555-0100"}]) {
  await expect(t.mutation(api.registrations.create,{adminSecret,...base,...contact})).rejects.toThrow("security retired");
 }
 await expect(t.mutation(api.registrations.deleteRegistration,{adminSecret,id:source})).rejects.toThrow("security retired");
 await expect(t.mutation(api.adminEmailChange.change,{adminSecret,registrationId:source,expectedOldEmail:base.email,newEmail:"new@example.invalid",reason:"test retirement"})).rejects.toThrow("security retired");
 await expect(t.mutation(api.adminEmailChange.change,{adminSecret,registrationId:survivor,expectedOldEmail:"survivor@example.invalid",newEmail:base.email,reason:"test retirement"})).rejects.toThrow("security retired");
 expect(await t.run(ctx=>ctx.db.get(source))).toMatchObject({email:base.email,phone:base.phone,securityRetiredAt:0});
});
test("retired participants cannot match or disclose contacts, with provenance alone failing closed", async () => {
 const {t,source,survivor,recipient} = await fixture();
 await t.run(ctx=>ctx.db.patch(source,{mergedIntoRegistrationId:survivor}));
 await expect(t.run(ctx=>assertMatchingParticipants(ctx,source,recipient))).rejects.toThrow();
 await t.run(async ctx=>{
  const now=Date.now();
  const eventId=await ctx.db.insert("events",{title:"Test",eventCode:"security",eventMonth:"2026-11",series:"test",location:"Test",startsAt:now-2000,endsAt:now-1000,status:"completed",maleCapacity:10,femaleCapacity:10,createdAt:now,updatedAt:now});
  const id=await ctx.db.insert("interests",{eventId,fromRegistrationId:source,toRegistrationId:recipient,source:"platform_submission",visibility:"admin_actionable",status:"new",createdAt:now,updatedAt:now});
  const interest=(await ctx.db.get(id))!;
  const flowId=await ctx.db.insert("interestFlows",{interestId:id,fromRegistrationId:source,toRegistrationId:recipient,flowStatus:"contact_shared",recipientDecision:"accepted",requesterFinalApproval:"approved",recipientFinalApproval:"approved",photoDecision:"approved",contactSharedAt:now,createdAt:now,updatedAt:now});
  expect(await contactsVisible(ctx,interest,await ctx.db.get(flowId))).toBe(false);
 });
 expect(await t.query(api.registrations.getByProfileAccessToken,{token:"profile"})).toBeNull();
});

test("numeric discovery and submission never resolve retired targets or redirect to survivor", async () => {
 const {t,source,recipient} = await fixture();
 const eventId=await t.run(async ctx=>{
  const now=Date.now();
  const eventId=await ctx.db.insert("events",{title:"Test",eventCode:"numbers",eventMonth:"2026-11",series:"1plus1_match",location:"Test",startsAt:now-2000,endsAt:now-1000,status:"completed",maleCapacity:10,femaleCapacity:10,interestSubmissionsEnabled:true,createdAt:now,updatedAt:now});
  await ctx.db.insert("applicantSessions",{registrationId:recipient,sessionHash:"recipient-session",createdAt:now,expiresAt:now+100000});
  await ctx.db.patch(recipient,{profileCompletionStatus:"completed"});
  await ctx.db.insert("eventRegistrations",{eventId,registrationId:recipient,gender:"female",registrationStatus:"approved",confirmationStatus:"confirmed",attendanceStatus:"attended",eligibilityStatus:"approved_member",createdAt:now,updatedAt:now});
  await ctx.db.patch(source,{securityRetiredAt:now});
  return eventId;
 });
 expect(await t.mutation(api.applicantInterests.lookupInterestName,{sessionHash:"recipient-session",applicantNumber:79,expectedEventId:eventId})).toEqual({firstName:null});
 await expect(t.mutation(api.applicantInterests.submitInterestNumber,{sessionHash:"recipient-session",applicantNumber:79,expectedEventId:eventId})).rejects.toThrow("could not be verified");
 expect(await t.run(ctx=>ctx.db.query("interests").collect())).toEqual([]);
});

test("retired source cannot mint a welcome receipt capability through webhook replay", async () => {
 const {t,source} = await fixture();
 await t.run(async ctx => {
  await ctx.db.patch(source, {securityRetiredAt: Date.now(), paymentStatus: "paid"});
  await ctx.db.insert("checkoutLinks", {registrationId: source, stripeSessionId: "synthetic-retired-checkout", createdAt: 1});
 });
 const claim = await t.mutation(api.registrations.claimWelcomeReceipt, {adminSecret, stripeSessionId: "synthetic-retired-checkout", token: "synthetic-lease", tokenHash: "synthetic-new-login", profileUrl: "https://example.invalid/retired-login"}).catch(() => ({claimed: false}));
 expect(claim.claimed).toBe(false);
});
