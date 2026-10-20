import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";
import { makeFunctionReference } from "convex/server";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
const list = makeFunctionReference<"query">("eventAttendees:list");
const setAttendance = makeFunctionReference<"mutation">("eventAttendees:setAttendance");
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const now = Date.now();
    const event = await ctx.db.insert("events", { title: "Match", eventCode: "test", eventMonth: "2026-10", series: "1plus1_match", location: "Test", startsAt: now - 2000, endsAt: now - 1000, status: "completed", maleCapacity: 60, femaleCapacity: 60, createdAt: now, updatedAt: now });
    const people = [];
    for (let index = 0; index < 5; index++) {
      const id = await ctx.db.insert("registrations", { publicApplicantNumber: index + 1, name: "Person " + (index + 1), age: 30, gender: index === 0 ? "male" : "female", maritalStatus: "single", education: "College", job: "Engineer", email: index + "@test.com", phone: "555", status: "approved", paymentStatus: "paid", profileCompletionStatus: "completed", photoSharingPermission: "ask_me_first", createdAt: now });
      people.push(id);
      await ctx.db.insert("applicantSessions", { registrationId: id, sessionHash: "session" + index, expiresAt: now + 100000, createdAt: now });
      await ctx.db.insert("eventAttendees", { eventId: event, registrationId: id, addedAt: now });
    }
    return { event, people };
  });
  return { t, ...ids };
}
const submit = (number = 2, name = "Person " + number) => ({ sessionHash: "session0", applicantNumber: number, applicantName: name });
test("requires session and exact number/name; no applicant directory in either portal response", async () => {
  const { t } = await fixture();
  await expect(t.mutation(api.applicantInterests.submitInterestNumber, { ...submit(), sessionHash: "forged" })).rejects.toThrow("Unauthorized");
  await expect(t.mutation(api.applicantInterests.submitInterestNumber, submit(2, "Wrong"))).rejects.toThrow("could not be verified");
  await expect(t.mutation(api.applicantInterests.submitInterestNumber, submit(999))).rejects.toThrow("could not be verified");
  const dashboard = await t.query(api.applicantInterests.getDashboard, { sessionHash: "session0" });
  expect(dashboard).not.toHaveProperty("eligibleInterestTargets");
  expect(dashboard.canSubmitInterest).toBe(true);
  const events = await t.query(api.events.getApplicantEvents, { sessionHash: "session0" });
  expect(events).not.toHaveProperty("eligibleInterestTargetIds");
  await expect(t.mutation(api.applicantInterests.submitInterestNumber, submit(2, "  PERSON   2  "))).resolves.toHaveProperty("interestId");
});
test("both parties must attend latest matching event; Real Talk is attendance-only", async () => {
  const { t, event, people } = await fixture();
  await t.run(async ctx => {
    const row = await ctx.db.query("eventAttendees").withIndex("by_eventId_and_registrationId", q => q.eq("eventId", event).eq("registrationId", people[1])).unique();
    await ctx.db.delete(row!._id);
  });
  await expect(t.mutation(api.applicantInterests.submitInterestNumber, submit())).rejects.toThrow("attended");
  await t.run(async ctx => {
    await ctx.db.insert("eventAttendees", { eventId: event, registrationId: people[1], addedAt: Date.now() });
    const old = await ctx.db.get(event);
    const { _id, _creationTime, ...data } = old!;
    void _id; void _creationTime;
    await ctx.db.insert("events", { ...data, eventCode: "talk", series: "real_talk", endsAt: Date.now() - 100 });
  });
  await expect(t.mutation(api.applicantInterests.submitInterestNumber, submit())).resolves.toHaveProperty("interestId");
  await t.run(async ctx => {
    const old = await ctx.db.get(event);
    const { _id, _creationTime, ...data } = old!;
    void _id; void _creationTime;
    await ctx.db.insert("events", { ...data, eventCode: "new-match", endsAt: Date.now() - 50 });
  });
  expect((await t.query(api.applicantInterests.getDashboard, { sessionHash: "session0" })).canSubmitInterest).toBe(false);
  await expect(t.mutation(api.applicantInterests.submitInterestNumber, submit(3))).rejects.toThrow("attended");
  expect((await t.query(api.applicantInterests.getDashboard, { sessionHash: "session0" })).outbound).toHaveLength(1);
});
test("photo URLs require owner consent, even after contact sharing", async () => {
  const { t, people } = await fixture();
  await t.run(async ctx => {
    const image = await ctx.storage.store(new Blob(["photo"], { type: "image/png" }));
    await ctx.db.patch(people[0], { imageStorageIds: [image] });
  });
  const result = await t.mutation(api.applicantInterests.submitInterestNumber, submit());
  const dashboard = () => t.query(api.applicantInterests.getDashboard, { sessionHash: "session1" });
  expect((await dashboard()).inbound[0].counterparty?.imageUrls).toEqual([]);
  await t.run(async ctx => {
    const flow = await ctx.db.query("interestFlows").withIndex("by_interestId", q => q.eq("interestId", result.interestId)).unique();
    await ctx.db.patch(flow!._id, { contactSharedAt: Date.now() });
  });
  expect((await dashboard()).inbound[0].counterparty?.imageUrls).toEqual([]);
  await t.run(async ctx => { await ctx.db.patch(people[0], { photoSharingPermission: "yes" }); });
  expect((await dashboard()).inbound[0].counterparty?.imageUrls).toHaveLength(1);
});
test("max three submissions per event survives withdrawal", async () => {
  const { t } = await fixture();
  const first = await t.mutation(api.applicantInterests.submitInterestNumber, submit());
  await t.mutation(api.applicantInterests.withdrawOutbound, { sessionHash: "session0", interestId: first.interestId });
  await t.mutation(api.applicantInterests.submitInterestNumber, submit(3));
  await t.mutation(api.applicantInterests.submitInterestNumber, submit(4));
  await expect(t.mutation(api.applicantInterests.submitInterestNumber, submit(5))).rejects.toThrow("maximum of 3");
});
test("attendance admin authorization, idempotence, removal, deletion protection", async () => {
  vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "test-secret");
  try {
    const { t, event, people } = await fixture();
    await expect(t.query(list, { adminSecret: "wrong" })).rejects.toThrow("Unauthorized");
    await expect(t.mutation(setAttendance, { adminSecret: "wrong", eventId: event, registrationId: people[0], attending: false })).rejects.toThrow("Unauthorized");
    const args = { adminSecret: "test-secret", eventId: event, registrationId: people[0], attending: true };
    await t.mutation(setAttendance, args); await t.mutation(setAttendance, args);
    expect((await t.query(list, { adminSecret: "test-secret", eventId: event })).total).toBe(5);
    await expect(t.mutation(api.events.deleteEvent, { eventId: event })).rejects.toThrow("attendance history");
    await t.mutation(setAttendance, { ...args, attending: false });
    expect((await t.query(api.applicantInterests.getDashboard, { sessionHash: "session0" })).canSubmitInterest).toBe(false);
    await expect(t.mutation(api.applicantInterests.submitInterestNumber, submit())).rejects.toThrow("attended");
  } finally { vi.unstubAllEnvs(); }
});

test("profile share links cannot bypass photo consent, including legacy links", async () => {
  const { t, people } = await fixture();
  await expect(t.mutation(api.profileShares.create, { ownerRegistrationId: people[0], recipientRegistrationId: people[1], includeImages: true, shareToken: "test-share" })).rejects.toThrow("consent");
  await t.run(async ctx => {
    const image = await ctx.storage.store(new Blob(["photo"], { type: "image/png" }));
    await ctx.db.patch(people[0], { imageStorageIds: [image] });
    await ctx.db.insert("profileShares", { ownerRegistrationId: people[0], recipientRegistrationId: people[1], includeImages: true, shareToken: "legacy-share", status: "shared", createdAt: Date.now(), updatedAt: Date.now() });
  });
  const share = await t.query(api.profileShares.getByShareToken, { shareToken: "legacy-share" });
  expect(share?.includeImages).toBe(false);
  expect(share?.owner?.imageStorageIds).toEqual([]);
});
