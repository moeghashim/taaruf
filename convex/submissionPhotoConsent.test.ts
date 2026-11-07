import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import type { FunctionArgs } from "convex/server";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

type Gender = "male" | "female";
async function fixture(gender: Gender = "male", preference?: "yes" | "no" | "ask_me_first", photos = true) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const now = Date.now();
    const event = await ctx.db.insert("events", { title: "Synthetic photo test", eventCode: "photo-test", eventMonth: "2026-11", series: "1plus1_match", location: "Test", startsAt: now - 2000, endsAt: now - 1000, status: "completed", interestSubmissionsEnabled: true, maleCapacity: 60, femaleCapacity: 60, createdAt: now, updatedAt: now });
    const image = await ctx.storage.store(new Blob(["synthetic-photo"], { type: "image/png" }));
    const people = [];
    for (let i = 0; i < 3; i++) {
      const personGender = i === 0 ? gender : gender === "male" ? "female" : "male";
      const id = await ctx.db.insert("registrations", { publicApplicantNumber: i + 1, name: "Person " + i, age: 30, gender: personGender, maritalStatus: "single", education: "College", job: "Engineer", email: i + "@synthetic.invalid", phone: "555", status: "approved", paymentStatus: "paid", profileCompletionStatus: "completed", photoSharingPermission: i === 0 ? preference : "no", imageStorageIds: photos ? [image] : [], createdAt: now });
      people.push(id);
      await ctx.db.insert("applicantSessions", { registrationId: id, sessionHash: "photo-session" + i, expiresAt: now + 86400000, createdAt: now });
      await ctx.db.insert("eventRegistrations", { eventId: event, registrationId: id, gender: personGender, registrationStatus: "approved", attendanceStatus: "attended", confirmationStatus: "confirmed", eligibilityStatus: "approved_member", createdAt: now, updatedAt: now });
    }
    return { event, people, image };
  });
  const args = { expectedEventId: ids.event, sessionHash: "photo-session0", applicantNumber: 2, applicantName: "Person", photoConsent: "yes" as const };
  const submit = (photoConsent: "yes" | "no" = "yes") => t.mutation(api.applicantInterests.submitInterestNumber, { ...args, photoConsent });
  const dashboard = (i = 1) => t.query(api.applicantInterests.getDashboard, { sessionHash: "photo-session" + i });
  const snapshot = () => t.run(async ctx => ({ interests: await ctx.db.query("interests").collect(), flows: await ctx.db.query("interestFlows").collect(), events: await ctx.db.query("interestFlowEvents").collect(), registrations: await ctx.db.query("registrations").collect() }));
  return { t, ...ids, args, submit, dashboard, snapshot };
}

for (const gender of ["male", "female"] as const) {
  for (const preference of [undefined, "ask_me_first", "no", "yes"] as const) {
    test(`explicit yes with legacy ${preference}, sender ${gender}; visibility remains independent`, async () => {
      const f = await fixture(gender, preference);
      const result = await f.submit();
      expect((await f.t.run(ctx => ctx.db.get(f.people[0])))?.photoSharingPermission).toBe(preference);
      if (gender === "female") {
        expect((await f.dashboard()).inbound).toEqual([]);
        // Synthetic admin visibility alone must not bypass the profile gate.
        await f.t.run(ctx => ctx.db.patch(result.interestId, { visibility: "admin_actionable" }));
        expect((await f.dashboard()).inbound[0].counterparty?.imageUrls).toEqual([]);
        await f.t.run(async ctx => {
          const flow = await ctx.db.query("interestFlows").withIndex("by_interestId", q => q.eq("interestId", result.interestId)).unique();
          await ctx.db.patch(flow!._id, { contactSharedAt: Date.now(), bioVisibleAt: Date.now() });
        });
      }
      const urls = (await f.dashboard()).inbound[0].counterparty?.imageUrls;
      expect(urls).toHaveLength(1);
      expect(urls?.[0]).toEqual(expect.any(String));
      const unrelated = await f.dashboard(2);
      expect(unrelated.inbound).toEqual([]);
      expect(JSON.stringify(unrelated)).not.toContain(urls![0]);
    });
  }

  test(`explicit no overrides global yes and flow approval/contact sharing: ${gender}`, async () => {
    const f = await fixture(gender, "yes");
    const result = await f.submit("no");
    await f.t.run(async ctx => {
      await ctx.db.patch(result.interestId, { visibility: "admin_actionable" });
      const flow = await ctx.db.query("interestFlows").withIndex("by_interestId", q => q.eq("interestId", result.interestId)).unique();
      await ctx.db.patch(flow!._id, { contactSharedAt: Date.now(), bioVisibleAt: Date.now(), photoDecision: "approved", photoRequestedByRegistrationId: f.people[1] });
    });
    expect((await f.dashboard()).inbound[0].counterparty?.imageUrls).toEqual([]);
  });

  test(`identical retries never write or restore revoked consent: ${gender}`, async () => {
    const f = await fixture(gender, "yes");
    const result = await f.submit();
    const before = await f.snapshot();
    expect(await f.submit()).toMatchObject({ interestId: result.interestId, inboundInterestNotification: null });
    expect(await f.snapshot()).toEqual(before);
    await expect(f.submit("no")).rejects.toThrow("already submitted");
    expect(await f.snapshot()).toEqual(before);
    for (const sessionHash of ["photo-session1", "photo-session2", "forged"]) {
      await expect(f.t.mutation(api.applicantInterests.revokeSenderPhotoConsent, { sessionHash, interestId: result.interestId })).rejects.toThrow("Unauthorized");
      expect(await f.snapshot()).toEqual(before);
    }
    await f.t.mutation(api.applicantInterests.revokeSenderPhotoConsent, { sessionHash: "photo-session0", interestId: result.interestId });
    const revoked = await f.snapshot();
    expect(revoked.interests[0].senderPhotoConsentRevokedAt).toEqual(expect.any(Number));
    await f.submit();
    await f.t.mutation(api.applicantInterests.revokeSenderPhotoConsent, { sessionHash: "photo-session0", interestId: result.interestId });
    expect(await f.snapshot()).toEqual(revoked);
    if (gender === "male") expect((await f.dashboard()).inbound[0].counterparty?.imageUrls).toEqual([]);
  });
}

for (const status of ["closed", "declined", "withdrawn"] as const) test(`closed interest ${status} hides photos and rejects retries`, async () => {
  const f = await fixture();
  const result = await f.submit();
  expect((await f.dashboard()).inbound[0].counterparty?.imageUrls).toHaveLength(1);
  await f.t.run(ctx => ctx.db.patch(result.interestId, { status }));
  const before = await f.snapshot();
  expect((await f.dashboard()).inbound).toEqual([]);
  await expect(f.submit()).rejects.toThrow("already submitted");
  expect(await f.snapshot()).toEqual(before);
});

test("missing and malformed choices fail validation atomically", async () => {
  const f = await fixture();
  const before = await f.snapshot();
  const { photoConsent, ...withoutChoice } = f.args;
  void photoConsent;
  for (const input of [withoutChoice, ...[null, true, "", "ask_me_first", "YES", 1].map(photoConsent => ({ ...f.args, photoConsent }))]) {
    await expect(f.t.mutation(api.applicantInterests.submitInterestNumber, input as FunctionArgs<typeof api.applicantInterests.submitInterestNumber>)).rejects.toThrow();
    expect(await f.snapshot()).toEqual(before);
  }
});

test("stale event and invalid, expired, revoked sessions cannot write consent", async () => {
  const f = await fixture();
  const otherEvent = await f.t.run(async ctx => {
    const { _id, _creationTime, ...event } = (await ctx.db.get(f.event))!;
    void _id; void _creationTime;
    return ctx.db.insert("events", { ...event, eventCode: "other", interestSubmissionsEnabled: false });
  });
  const before = await f.snapshot();
  await expect(f.t.mutation(api.applicantInterests.submitInterestNumber, { ...f.args, expectedEventId: otherEvent })).rejects.toThrow("selected event changed");
  expect(await f.snapshot()).toEqual(before);
  for (const state of ["forged", "expired", "revoked"]) {
    await f.t.run(async ctx => {
      const session = await ctx.db.query("applicantSessions").withIndex("by_sessionHash", q => q.eq("sessionHash", "photo-session0")).unique();
      await ctx.db.patch(session!._id, { expiresAt: state === "expired" ? 1 : Date.now() + 86400000, revokedAt: state === "revoked" ? Date.now() : undefined });
    });
    await expect(f.t.mutation(api.applicantInterests.submitInterestNumber, { ...f.args, sessionHash: state === "forged" ? "forged" : f.args.sessionHash })).rejects.toThrow("Unauthorized");
    expect(await f.snapshot()).toEqual(before);
  }
});

test("yes with no stored photos returns no URLs and does not fabricate images", async () => {
  const f = await fixture("male", "no", false);
  await f.submit();
  expect((await f.dashboard()).inbound[0].counterparty?.imageUrls).toEqual([]);
  expect((await f.dashboard(0)).applicant.hasPhotos).toBe(false);
});

test("recipient gender is not implicit consent to expose their photos to sender", async () => {
  const f = await fixture("male", "yes");
  await f.submit();
  expect((await f.dashboard(0)).outbound[0].counterparty?.imageUrls).toEqual([]);
});
