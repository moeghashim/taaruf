// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./applicant/matchmaking-preference/route";
import { POST as checkout } from "./create-checkout-session/route";
import { POST as saveProfile } from "./applicant/profile/route";
const mocks = vi.hoisted(() => ({ session: vi.fn(), mutation: vi.fn(), query: vi.fn(), stripe: vi.fn() }));
vi.mock("@/lib/applicant-session", () => ({ getApplicantSessionHash: mocks.session }));
vi.mock("@/lib/convex", () => ({ getConvexClient: () => ({ mutation: mocks.mutation, query: mocks.query }) }));
vi.mock("convex/browser", () => ({ ConvexHttpClient: class { mutation = mocks.mutation; query = mocks.query; } }));
vi.mock("@/lib/stripe", () => ({ getStripe: () => ({ checkout: { sessions: { create: mocks.stripe } } }) }));
const request = (body: unknown) => new NextRequest("https://example.invalid/api/test", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks(); mocks.session.mockResolvedValue("owner-session");
  mocks.mutation.mockResolvedValue({ matchmakingPreference: "events_only", matchmakingPreferenceUpdatedAt: 12 });
  mocks.query.mockResolvedValue(null); mocks.stripe.mockResolvedValue({ id: "synthetic", url: "https://example.invalid/checkout" });
  vi.stubEnv("CONVEX_URL", "https://example.invalid");
});
it("requires authentication before reading or mutating preference", async () => {
  mocks.session.mockResolvedValue(null);
  expect((await POST(request({ matchmakingPreference: "beyond_events", expectedUpdatedAt: null }))).status).toBe(401);
  expect(mocks.mutation).not.toHaveBeenCalled();
});
it.each([{}, { matchmakingPreference: true, expectedUpdatedAt: null }, { matchmakingPreference: "events_only" }, { matchmakingPreference: "events_only", expectedUpdatedAt: "12" }])("rejects invalid input %j", async body => {
  expect((await POST(request(body))).status).toBe(400); expect(mocks.mutation).not.toHaveBeenCalled();
});
it("passes only authenticated identity, explicit choice and revision", async () => {
  const response = await POST(request({ matchmakingPreference: "events_only", expectedUpdatedAt: null, registrationId: "someone-else", sessionHash: "forged" }));
  expect(response.status).toBe(200);
  expect(mocks.mutation).toHaveBeenCalledWith(expect.anything(), { sessionHash: "owner-session", matchmakingPreference: "events_only", expectedUpdatedAt: null });
});
it("returns conflict without retrying the write", async () => {
  mocks.mutation.mockRejectedValue(new Error("Matchmaking preference changed. Refresh and try again."));
  expect((await POST(request({ matchmakingPreference: "beyond_events", expectedUpdatedAt: 12 }))).status).toBe(409);
  expect(mocks.mutation).toHaveBeenCalledTimes(1);
});
it("generic profile save never writes matchmaking consent", async () => {
  await saveProfile(request({ matchmakingPreference: "beyond_events", expectedUpdatedAt: null }));
  expect(mocks.mutation.mock.calls[0][1]).not.toHaveProperty("matchmakingPreference");
});
const registration = { name: "Synthetic", age: 30, gender: "male", maritalStatus: "single", education: "degree", job: "Tester", email: "synthetic@example.invalid", phone: "000", ethnicity: "Test", prayerCommitment: "always_five", hijabResponse: "yes", spouseRequirement1: "One", spouseRequirement2: "Two", spouseRequirement3: "Three", shareableBio: "Synthetic only", photoSharingPermission: "ask_me_first", imageStorageIds: ["synthetic"] };
it.each([undefined, "", "yes", true])("rejects checkout preference %j before Stripe", async matchmakingPreference => {
  expect((await checkout(request({ ...registration, matchmakingPreference }))).status).toBe(400);
  expect(mocks.stripe).not.toHaveBeenCalled(); expect(mocks.mutation).not.toHaveBeenCalled();
});
it.each(["events_only", "beyond_events"])("forwards %s through general and event checkout", async matchmakingPreference => {
  for (const eventCode of [undefined, "synthetic-event"]) {
    expect((await checkout(request({ ...registration, matchmakingPreference, eventCode }))).status).toBe(200);
    expect(mocks.mutation).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ matchmakingPreference, eventCode }));
  }
});

it("archived returning event applicant is rejected before creating checkout", async () => {
  mocks.query.mockResolvedValue({ archivedAt: 10 });
  expect((await checkout(request({ ...registration, matchmakingPreference: "events_only", eventCode: "synthetic-event" }))).status).toBe(409);
  expect(mocks.stripe).not.toHaveBeenCalled();
});
