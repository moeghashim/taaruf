import { beforeEach, expect, test, vi } from "vitest";
const { query, mutation, session } = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn(), session: vi.fn() }));
vi.mock("@/lib/convex", () => ({ getConvexClient: () => ({ query, mutation }) }));
vi.mock("@/lib/applicant-session", () => ({ getApplicantSessionHash: session }));
import { GET } from "./route";
beforeEach(() => { vi.clearAllMocks(); session.mockResolvedValue("private-hash"); });
test("read-only and private even across repeated eligibility changes", async () => {
  for (const canSubmitInterest of [false, true, false, true, false]) {
    query.mockResolvedValue({ canSubmitInterest, interestSubmissionEventId: canSubmitInterest ? "event" : null, interestSubmissionLimit: 3, interestSubmissions: [], applicant: { email: "private" }, sessionHash: "private-hash" });
    const response = await GET();
    expect(await response.json()).toEqual({ canSubmitInterest, interestSubmissionEventId: canSubmitInterest ? "event" : null, interestSubmissionLimit: 3, interestSubmissions: [] });
    expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(response.headers.get("vary")).toBe("Cookie");
  }
  expect(mutation).not.toHaveBeenCalled();
});
test("no session fails closed", async () => { session.mockResolvedValue(null); expect((await GET()).status).toBe(401); expect(query).not.toHaveBeenCalled(); });
test("expired session fails closed without exposing backend details", async () => { query.mockRejectedValue(new Error("Convex: Unauthorized private-hash")); const response = await GET(); expect(response.status).toBe(401); expect(await response.text()).not.toContain("private-hash"); });
test("network errors are retryable and redacted", async () => { query.mockRejectedValue(new Error("private trace")); const response = await GET(); expect(response.status).toBe(503); expect(await response.text()).not.toContain("private trace"); });
