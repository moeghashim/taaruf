// @vitest-environment node
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { changedDateOfBirth } from "@/lib/date-of-birth";
const mocks = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn(), create: vi.fn(), session: vi.fn() }));
vi.mock("convex/browser", () => ({ ConvexHttpClient: class { query = mocks.query; mutation = mocks.mutation; } }));
vi.mock("@/lib/convex", () => ({ getConvexClient: () => ({ query: mocks.query, mutation: mocks.mutation }) }));
vi.mock("@/lib/stripe", () => ({ getStripe: () => ({ checkout: { sessions: { create: mocks.create } } }) }));
vi.mock("@/lib/applicant-session", () => ({ getApplicantSessionHash: mocks.session }));
vi.mock("@/lib/admin-server", () => ({ getAdminSecret: () => "synthetic-secret" }));
vi.mock("@/lib/photo-upload-server", () => ({ getSignupUploadHash: async () => "synthetic-upload" }));
import { POST as checkout } from "./create-checkout-session/route";
import { POST as owner } from "./applicant/profile/route";
import { POST as legacy, GET as legacyRead } from "./profile/[token]/route";
const context = { params: Promise.resolve({ token: "synthetic-token" }) };
const request = (body: object) => new NextRequest("https://example.invalid/api/test", { method: "POST", body: JSON.stringify(body) });
const signup = { name: "Synthetic", gender: "male", maritalStatus: "single", education: "College", job: "Test", email: "test@example.invalid", phone: "test", ethnicity: "test", prayerCommitment: "always_five", hijabResponse: "no", spouseRequirement1: "one", spouseRequirement2: "two", spouseRequirement3: "three", shareableBio: "test", photoSharingPermission: "no", imageStorageIds: ["synthetic"] };
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-11T02:00:00Z"));
  vi.stubEnv("CONVEX_URL", "https://synthetic.invalid");
  mocks.session.mockResolvedValue("synthetic-session"); mocks.query.mockResolvedValue(null);
  mocks.create.mockResolvedValue({ id: "cs_synthetic", url: "https://checkout.invalid" });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
for (const dateOfBirth of [undefined, "", null, 1990, "2000-02-30", "2000-1-01", "2027-01-01", "2008-11-11", "1926-11-10"]) {
  test("checkout rejects invalid birthday before any side effect: " + String(dateOfBirth), async () => {
    const response = await checkout(request({ ...signup, dateOfBirth, age: 30 }));
    expect(response.status).toBe(400); expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.mutation).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ error: "Enter a valid date of birth (age 18–99)." });
  });
}
test("checkout calculates age using Chicago date, ignores submitted age, keeps birthday out of Stripe", async () => {
  expect((await checkout(request({ ...signup, dateOfBirth: "2000-11-11", age: 80 }))).status).toBe(200);
  expect(mocks.mutation.mock.calls[0][1]).toMatchObject({ dateOfBirth: "2000-11-11", age: 25 });
  expect(JSON.stringify(mocks.create.mock.calls)).not.toContain("2000-11-11");
});
for (const [name, post] of [["owner", (body: object) => owner(request(body))], ["legacy", (body: object) => legacy(request(body), context)]] as const) {
  test(name + " permits unrelated saves after clearing unknown DOB and for unchanged age 100", async () => {
    // The shared editor policy must omit these values before HTTP eligibility validation.
    expect(changedDateOfBirth("1990-01-02", undefined)).toBe("1990-01-02");
    for (const [value, original] of [["", undefined], ["1926-11-10", "1926-11-10"]] as const) {
      mocks.mutation.mockClear();
      const dateOfBirth = changedDateOfBirth(value, original);
      expect(dateOfBirth).toBeUndefined();
      expect((await post({ education: "Updated", ...(dateOfBirth !== undefined ? { dateOfBirth } : {}) })).status).toBe(200);
      expect(mocks.mutation.mock.calls[0][1]).not.toHaveProperty("dateOfBirth");
      expect(mocks.mutation.mock.calls[0][1]).toMatchObject({ education: "Updated" });
    }
    expect((await post({ dateOfBirth: changedDateOfBirth("1926-11-09", "1926-11-10") })).status).toBe(400);
    expect(changedDateOfBirth("", "1990-01-02")).toBe("");
    expect((await post({ dateOfBirth: changedDateOfBirth("", "1990-01-02") })).status).toBe(400);
  });
  test(name + " preserves omitted birthday and forwards provided birthday", async () => {
    expect((await post({ ethnicity: "test" })).status).toBe(200);
    expect(mocks.mutation.mock.calls[0][1]).not.toHaveProperty("dateOfBirth");
    mocks.mutation.mockClear();
    expect((await post({ dateOfBirth: "1990-01-02" })).status).toBe(200);
    expect(mocks.mutation.mock.calls[0][1]).toMatchObject({ dateOfBirth: "1990-01-02" });
  });
  for (const dateOfBirth of ["", null, "2010-01-01", "1900-01-01", "2001-02-29"]) test(name + " rejects invalid edit " + dateOfBirth, async () => {
    expect((await post({ dateOfBirth })).status).toBe(400); expect(mocks.mutation).not.toHaveBeenCalled();
  });
}
test("signed-in birthday editing requires a session", async () => {
  mocks.session.mockResolvedValue(null);
  expect((await owner(request({ dateOfBirth: "1990-01-02" }))).status).toBe(401); expect(mocks.mutation).not.toHaveBeenCalled();
});
test("legacy owner read returns known birthday without inventing a legacy birthday", async () => {
  for (const dateOfBirth of [undefined, "1990-01-02"]) {
    mocks.query.mockResolvedValue({ name: "Synthetic", images: [], dateOfBirth });
    const response = await legacyRead(request({}), context);
    expect((await response.json()).registration.dateOfBirth).toBe(dateOfBirth);
  }
});

for (const backgroundMatchmakingOptIn of [true,false,undefined]) test('checkout forwards consent '+backgroundMatchmakingOptIn,async()=>{
  expect((await checkout(request({...signup,dateOfBirth:'1990-01-01',backgroundMatchmakingOptIn}))).status).toBe(200);
  expect(mocks.mutation.mock.calls[0][1].backgroundMatchmakingOptIn).toBe(backgroundMatchmakingOptIn);
  expect(JSON.stringify(mocks.create.mock.calls)).not.toContain('backgroundMatchmaking');
});
for (const backgroundMatchmakingOptIn of ['true',1,null,[],{}]) test('checkout rejects malformed consent '+JSON.stringify(backgroundMatchmakingOptIn),async()=>{
  expect((await checkout(request({...signup,dateOfBirth:'1990-01-01',backgroundMatchmakingOptIn}))).status).toBe(400);
  expect(mocks.query).not.toHaveBeenCalled();expect(mocks.create).not.toHaveBeenCalled();expect(mocks.mutation).not.toHaveBeenCalled();
});
test('provider failure never persists signup consent',async()=>{
  mocks.create.mockRejectedValue(new Error('synthetic provider failure'));
  expect((await checkout(request({...signup,dateOfBirth:'1990-01-01',backgroundMatchmakingOptIn:true}))).status).toBe(500);
  expect(mocks.mutation).not.toHaveBeenCalled();
});
