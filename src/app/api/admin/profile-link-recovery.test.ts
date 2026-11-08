// @vitest-environment node
import crypto from "node:crypto";
import { getFunctionName } from "convex/server";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "../../../../../convex/_generated/api";
const mocks = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn(), action: vi.fn(), email: vi.fn() }));
vi.mock("convex/browser", () => ({ ConvexHttpClient: class { query = mocks.query; mutation = mocks.mutation; action = mocks.action; } }));
vi.mock("@/lib/email", () => ({ sendProfileCompletionEmail: mocks.email }));
import { POST as send } from "./send-profile-link/route";
import { POST as backfill } from "./backfill-profile-completion/route";
const adminSecret = "synthetic-service";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CONVEX_URL", "https://synthetic.invalid");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.invalid");
  vi.stubEnv("ADMIN_PASSWORD", "synthetic");
  vi.stubEnv("ADMIN_TOKEN_SALT", "salt");
  vi.stubEnv("ATTENDANCE_ADMIN_SECRET", adminSecret);
  mocks.query.mockResolvedValue({ _id: "synthetic-id", name: "Synthetic", email: "synthetic@example.invalid", profileCompletionStatus: "in_progress", profileAccessToken: "stale" });
  mocks.action.mockResolvedValue({ scanned: 1, completed: [], needsProfileEmail: [{ id: "synthetic-id" }] });
  mocks.mutation.mockImplementation(async fn => getFunctionName(fn) === "registrations:ensureProfileAccessToken" ? "fresh-usable-token" : null);
  mocks.email.mockResolvedValue({ success: true });
});
afterEach(() => vi.unstubAllEnvs());
for (const [name, handler, body] of [["send", send, { registrationIds: ["synthetic-id"] }], ["backfill", backfill, { dryRun: false }]] as const) {
  function request() {
    const token = crypto.createHash("sha256").update("syntheticsalt").digest("hex");
    return new NextRequest("https://app.invalid/api/admin/" + name, { method: "POST", headers: { origin: "https://app.invalid", cookie: "admin_token=" + token }, body: JSON.stringify(body) });
  }
  test(name + " emails only the token resolved by authenticated backend issuance", async () => {
    expect((await handler(request())).status).toBe(200);
    expect(mocks.mutation).toHaveBeenCalledWith(api.registrations.ensureProfileAccessToken, { adminSecret, id: "synthetic-id", token: expect.stringMatching(/^[a-f0-9]{48}$/) });
    expect(mocks.email).toHaveBeenCalledWith({ name: "Synthetic", email: "synthetic@example.invalid", profileUrl: "https://app.invalid/profile/fresh-usable-token" });
    if (name === "backfill") expect(mocks.action).toHaveBeenCalledWith(api.migrations.profileCompletion.backfillProfileCompletionStatuses, expect.objectContaining({ adminSecret }));
  });
  test(name + " does not email when usable issuance fails", async () => {
    mocks.mutation.mockRejectedValue(new Error("private backend arguments"));
    const response = await handler(request());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private backend");
    expect(mocks.email).not.toHaveBeenCalled();
  });
}
