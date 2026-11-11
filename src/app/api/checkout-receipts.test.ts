// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import crypto from "node:crypto";
import { POST as checkout } from "./create-checkout-session/route";
import { POST as interest } from "./applicant/interests/route";
import { POST as webhook } from "./webhook/route";
import { POST as repair } from "./admin/fix-payments/route";
const mocks = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn(), eventReceipt: vi.fn(), welcome: vi.fn(), constructEvent: vi.fn(), list: vi.fn(), create: vi.fn() }));
vi.mock("convex/browser", () => ({ ConvexHttpClient: class { query = mocks.query; mutation = mocks.mutation; } }));
vi.mock("@/lib/stripe", () => ({ getStripe: () => ({ webhooks: { constructEvent: mocks.constructEvent }, checkout: { sessions: { list: mocks.list, create: mocks.create } } }) }));
vi.mock("@/lib/event-registration-receipt", () => ({ sendCheckoutReceipt: mocks.eventReceipt }));
vi.mock("@/lib/email", () => ({ sendConfirmationEmail: mocks.welcome }));
vi.mock("@/lib/convex", () => ({ getConvexClient: () => ({ query: mocks.query, mutation: mocks.mutation }) }));
vi.mock("@/lib/photo-upload-server", () => ({ getSignupUploadHash: async () => "synthetic-upload" }));
vi.mock("@/lib/applicant-session", () => ({ getApplicantSessionHash: async () => "synthetic-session", createToken: () => "mock-token", hashToken: () => "mock-hash" }));
const session = { id: "cs_test", payment_status: "paid", metadata: { eventCode: "evening" } };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CONVEX_URL", "https://example.invalid");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "mock");
  vi.stubEnv("ADMIN_PASSWORD", "mock");
  vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "synthetic-service");
  vi.stubEnv("ADMIN_TOKEN_SALT", "mock-salt");
  mocks.query.mockResolvedValue({ _id: "profile", name: "Amina", email: "test@example.invalid", paymentStatus: "paid", confirmationEmailSent: true });
  mocks.mutation.mockResolvedValue(null);
  mocks.eventReceipt.mockResolvedValue({ sent: true });
  mocks.constructEvent.mockReturnValue({ type: "checkout.session.completed", data: { object: session } });
  mocks.list.mockResolvedValue({ data: [session] });
  mocks.create.mockResolvedValue({ id: "synthetic-checkout", url: "https://checkout.invalid" });
});
const request = () => new NextRequest("https://example.invalid/api/webhook", { method: "POST", headers: { "stripe-signature": "mock" }, body: "mock" });
it("paid webhook uses event receipt even if profile welcome was previously sent", async () => {
  expect((await webhook(request())).status).toBe(200);
  expect(mocks.eventReceipt).toHaveBeenCalledWith(expect.anything(), "cs_test", "https://example.invalid");
  expect(mocks.welcome).not.toHaveBeenCalled();
});
it("provider failure requests Stripe retry", async () => {
  mocks.eventReceipt.mockResolvedValue({ sent: false, error: "temporary" });
  expect((await webhook(request())).status).toBe(500);
});
it("non-event webhook replay skips already-sent welcome", async () => {
  mocks.constructEvent.mockReturnValue({ type: "checkout.session.completed", data: { object: { ...session, metadata: {} } } });
  await webhook(request());
  expect(mocks.welcome).not.toHaveBeenCalled();
  expect(mocks.eventReceipt).toHaveBeenCalled();
});
it("payment repair uses same event receipt path independently of global welcome", async () => {
  const token = crypto.createHash("sha256").update("mockmock-salt").digest("hex");
  const result = await repair(new NextRequest("https://example.invalid/api/admin/fix-payments", { method: "POST", headers: { cookie: "admin_token=" + token, origin: "https://example.invalid" } }));
  expect(result.status).toBe(200);
  expect(mocks.eventReceipt).toHaveBeenCalledWith(expect.anything(), "cs_test", "https://example.invalid");
  expect(mocks.welcome).not.toHaveBeenCalled();
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
for (const kind of ["checkout", "paid webhook", "expired webhook", "payment repair", "interest"]) it(kind + " logs fixed messages without backend credentials or applicant data", async () => {
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  const failure = new Error('private-service-secret synthetic@example.invalid {adminSecret: private-service-secret}');
  mocks.mutation.mockRejectedValue(failure);
  if (kind === "checkout") {
    mocks.query.mockResolvedValue(null);
    expect((await checkout(new NextRequest("https://example.invalid", { method: "POST", body: JSON.stringify({ name: "Synthetic", dateOfBirth: "1996-01-01", gender: "male", maritalStatus: "single", education: "College", job: "Test", email: "synthetic@example.invalid", phone: "synthetic", ethnicity: "Test", prayerCommitment: "always_five", hijabResponse: "no", spouseRequirement1: "one", spouseRequirement2: "two", spouseRequirement3: "three", shareableBio: "Synthetic", photoSharingPermission: "ask_me_first", imageStorageIds: ["synthetic-image"] }) }))).status).toBe(500);
  } else if (kind === "interest") {
    expect((await interest(new NextRequest("https://example.invalid", { method: "POST", body: JSON.stringify({ action: "submit_number", applicantNumber: 42, applicantName: "Synthetic", expectedEventId: "synthetic", photoConsent: "no" }) }))).status).toBe(500);
  } else if (kind === "payment repair") {
    mocks.query.mockRejectedValue(failure);
    const token = crypto.createHash("sha256").update("mockmock-salt").digest("hex");
    expect((await repair(new NextRequest("https://example.invalid/api/admin/fix-payments", { method: "POST", headers: { cookie: "admin_token=" + token, origin: "https://example.invalid" } }))).status).toBe(200);
  } else {
    if (kind === "expired webhook") mocks.constructEvent.mockReturnValue({ type: "checkout.session.expired", data: { object: session } });
    expect((await webhook(request())).status).toBe(kind === "paid webhook" ? 500 : 200);
  }
  expect(logged).toHaveBeenCalled();
  expect(logged.mock.calls.flat().join(" ")).not.toMatch(/private-service-secret|synthetic@example|adminSecret/);
});
