// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import crypto from "node:crypto";
import { POST as webhook } from "./webhook/route";
import { POST as repair } from "./admin/fix-payments/route";
const mocks = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn(), eventReceipt: vi.fn(), welcome: vi.fn(), constructEvent: vi.fn(), list: vi.fn() }));
vi.mock("convex/browser", () => ({ ConvexHttpClient: class { query = mocks.query; mutation = mocks.mutation; } }));
vi.mock("@/lib/stripe", () => ({ getStripe: () => ({ webhooks: { constructEvent: mocks.constructEvent }, checkout: { sessions: { list: mocks.list } } }) }));
vi.mock("@/lib/event-registration-receipt", () => ({ sendCheckoutReceipt: mocks.eventReceipt }));
vi.mock("@/lib/email", () => ({ sendConfirmationEmail: mocks.welcome }));
vi.mock("@/lib/applicant-session", () => ({ createToken: () => "mock-token", hashToken: () => "mock-hash" }));
const session = { id: "cs_test", payment_status: "paid", metadata: { eventCode: "evening" } };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CONVEX_URL", "https://example.invalid");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "mock");
  vi.stubEnv("ADMIN_PASSWORD", "mock");
  vi.stubEnv("ADMIN_TOKEN_SALT", "mock-salt");
  mocks.query.mockResolvedValue({ _id: "profile", name: "Amina", email: "test@example.invalid", paymentStatus: "paid", confirmationEmailSent: true });
  mocks.mutation.mockResolvedValue(null);
  mocks.eventReceipt.mockResolvedValue({ sent: true });
  mocks.constructEvent.mockReturnValue({ type: "checkout.session.completed", data: { object: session } });
  mocks.list.mockResolvedValue({ data: [session] });
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
  const result = await repair(new NextRequest("https://example.invalid/api/admin/fix-payments", { method: "POST", headers: { cookie: "admin_token=" + token } }));
  expect(result.status).toBe(200);
  expect(mocks.eventReceipt).toHaveBeenCalledWith(expect.anything(), "cs_test", "https://example.invalid");
  expect(mocks.welcome).not.toHaveBeenCalled();
});
