// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import type { ConvexHttpClient } from "convex/browser";
import type { Id } from "../../convex/_generated/dataModel";
import { sendEventReceipt, sendCheckoutEventReceipt } from "./event-registration-receipt";
import { sendEventRegistrationReceivedEmail } from "./email";
const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));
const id = "event-row" as Id<"eventRegistrations">;
const claim = { claimed: true, key: "event-registration-received/event-row/1", name: "Amina <test>", email: "test@example.invalid", eventTitle: "Evening & friends", registrationStatus: "waitlisted" as const };
beforeEach(() => { vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "test-secret"); send.mockReset().mockResolvedValue({ data: { id: "mock" } }); });
it.each(["pending", "waitlisted"] as const)("renders persisted %s in subject/text/HTML", async registrationStatus => {
  await sendEventRegistrationReceivedEmail({ ...claim, registrationStatus, eventRegistrationId: id });
  const payload = send.mock.calls[0][0];
  for (const value of [payload.subject, payload.text, payload.html]) expect(value).toMatch(registrationStatus === "pending" ? /pending/i : /waitlist/i);
  expect(payload.html).toContain("Amina &lt;test&gt;");
  expect(payload.html).toContain("Evening &amp; friends");
  expect(payload.text).not.toContain("has been approved");
  expect(send.mock.calls[0][1]).toEqual({ idempotencyKey: "event-registration-received/event-row" });
});
it.each(["approved", "rejected", "withdrawn"] as const)("does not auto-send status email on %s retry", async registrationStatus => {
  await sendEventRegistrationReceivedEmail({ ...claim, registrationStatus, eventRegistrationId: id });
  expect(send).not.toHaveBeenCalled();
});
it("duplicate signup claims send once, using claim status rather than requested capacity", async () => {
  const mutation = vi.fn().mockResolvedValueOnce(claim).mockResolvedValueOnce(null).mockResolvedValueOnce({ claimed: false });
  const convex = { mutation } as unknown as ConvexHttpClient;
  expect(await sendEventReceipt(convex, id)).toEqual({ sent: true, error: undefined });
  expect(await sendEventReceipt(convex, id)).toEqual({ sent: false });
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][0].subject).toContain("waitlist");
});
it("failure releases claim for retry with stable provider idempotency key", async () => {
  send.mockResolvedValueOnce({ error: { message: "temporary" } });
  const mutation = vi.fn().mockResolvedValueOnce(claim).mockResolvedValueOnce(null).mockResolvedValueOnce(claim);
  const convex = { mutation } as unknown as ConvexHttpClient;
  expect(await sendEventReceipt(convex, id)).toEqual({ sent: false, error: "temporary" });
  expect(mutation.mock.calls[1][1]).toMatchObject({ eventRegistrationId: id, error: "temporary", key: claim.key });
  expect((await sendEventReceipt(convex, id)).sent).toBe(true);
  expect(send.mock.calls[0][1]).toEqual(send.mock.calls[1][1]);
});
it("checkout selects immutable persisted association without event metadata", async () => {
  const query = vi.fn().mockResolvedValue({ eventRegistrationId: id, receiptAttempt: 1 });
  const mutation = vi.fn().mockResolvedValue(claim);
  await sendCheckoutEventReceipt({ query, mutation } as unknown as ConvexHttpClient, "cs_old");
  expect(mutation.mock.calls[0][1]).toMatchObject({ eventRegistrationId: id, receiptAttempt: 1 });
});
it("unlinked historical checkout fails closed", async () => {
  const query = vi.fn().mockResolvedValue(null);
  const result = await sendCheckoutEventReceipt({ query } as unknown as ConvexHttpClient, "cs_old");
  expect("error" in result && result.error).toContain("no safe receipt association");
  expect(send).not.toHaveBeenCalled();
});
