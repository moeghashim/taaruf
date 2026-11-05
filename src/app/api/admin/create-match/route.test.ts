import crypto from "crypto";
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "../../../../../convex/_generated/api";
import schema from "../../../../../convex/schema";
import { modules } from "../../../../../convex/test.setup";

const { mutation } = vi.hoisted(() => ({ mutation: vi.fn() }));
vi.mock("@/lib/convex", () => ({ getConvexClient: () => ({ mutation }) }));
import { POST } from "./route";

const password = "synthetic-password";
const serviceSecret = "synthetic-distinct-service-secret";
const salt = "synthetic-salt";
const token = crypto.createHash("sha256").update(password + salt).digest("hex");
const valid = { maleRegistrationId: "synthetic-man", femaleRegistrationId: "synthetic-woman" };
const genericError = "Unable to create match. Refresh and try again; if this continues, contact support.";
beforeEach(() => {
  vi.stubEnv("ADMIN_PASSWORD", password);
  vi.stubEnv("ADMIN_TOKEN_SALT", salt);
  vi.stubEnv("ATTENDANCE_ADMIN_SECRET", serviceSecret);
  mutation.mockReset();
  mutation.mockResolvedValue("synthetic-match");
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
function request(body: unknown = valid, cookie = token, origin?: string, raw = false) {
  return new NextRequest("https://synthetic.invalid/api/admin/create-match", {
    method: "POST", headers: { cookie: cookie ? "admin_token=" + cookie : "", ...(origin ? { origin } : {}) },
    body: raw ? String(body) : JSON.stringify(body),
  });
}

test.each(["", "forged", "0".repeat(64), "é".repeat(64)])("fails closed for invalid cookie %j before parsing or backend access", async cookie => {
  const response = await POST(request("not json", cookie, undefined, true));
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: "Your admin session has expired. Sign in again." });
  expect(mutation).not.toHaveBeenCalled();
});
test("fails closed with no configured admin password", async () => {
  vi.stubEnv("ADMIN_PASSWORD", "");
  expect((await POST(request())).status).toBe(401);
  expect(mutation).not.toHaveBeenCalled();
});
test("allows browser-facing loopback host despite Next URL normalization", async () => {
  const req = request();
  req.headers.set("host", "127.0.0.1:3342");
  req.headers.set("origin", "http://127.0.0.1:3342");
  expect((await POST(req)).status).toBe(200);
});
test.each(["null", "not-a-url", "file://synthetic.invalid", "https://synthetic.invalid:444"])("rejects invalid origin %s", async origin => {
  expect((await POST(request(valid, token, origin))).status).toBe(403);
  expect(mutation).not.toHaveBeenCalled();
});
test("rejects cross-origin writes", async () => {
  expect((await POST(request(valid, token, "https://attacker.invalid"))).status).toBe(403);
  expect(mutation).not.toHaveBeenCalled();
});

test.each([null, [], {}, { maleRegistrationId: "m" }, { ...valid, maleRegistrationId: "" }, { ...valid, femaleRegistrationId: 42 }, { ...valid, adminNotes: null }, { ...valid, adminNotes: 42 }, { ...valid, adminNotes: "x".repeat(2001) }])("rejects malformed input %# without invoking backend", async body => {
  expect((await POST(request(body))).status).toBe(400);
  expect(mutation).not.toHaveBeenCalled();
});
test("malformed JSON returns a safe error", async () => {
  const response = await POST(request("{broken", token, undefined, true));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: genericError });
  expect(mutation).not.toHaveBeenCalled();
});
test("uses server credentials and ignores client-forged consent or sharing fields", async () => {
  const response = await POST(request({ ...valid, adminSecret: "attacker", adminNotes: "x".repeat(2000), status: "contact_shared", recipientFinalApproval: "approved", includeImages: true }, token, "https://synthetic.invalid"));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ matchId: "synthetic-match" });
  expect(mutation).toHaveBeenCalledExactlyOnceWith(api.matches.create, { ...valid, adminSecret: serviceSecret, adminNotes: "x".repeat(2000) });
});
test("surfaces deliberate Convex domain errors without the transport wrapper", async () => {
  mutation.mockRejectedValue(new ConvexError("Select two different applicants."));
  const response = await POST(request());
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "Select two different applicants." });
});
test.each([new Error("secret backend trace: synthetic-password"), new ConvexError({ secret: "synthetic-password" }), "private transport detail"])("redacts non-public backend errors %#", async error => {
  mutation.mockRejectedValue(error);
  const response = await POST(request());
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: genericError });
});

test("actual POST bridges to real in-memory mutation, returns persisted ID, and blocks repeat creation", async () => {
  const t = convexTest(schema, modules);
  const pair = await t.run(async ctx => {
    const base = { age: 30, maritalStatus: "single", education: "College", job: "Engineer", phone: "5550100", status: "approved" as const, profileCompletionStatus: "completed" as const, createdAt: 1 };
    return {
      maleRegistrationId: await ctx.db.insert("registrations", { ...base, name: "Synthetic Man", gender: "male", email: "man@example.invalid" }),
      femaleRegistrationId: await ctx.db.insert("registrations", { ...base, name: "Synthetic Woman", gender: "female", email: "woman@example.invalid" }),
    };
  });
  const before = await t.run(ctx => ctx.db.query("registrations").collect());
  mutation.mockImplementation((ref, args) => t.mutation(ref, args));
  const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network allowed"));
  const response = await POST(request({ ...pair, adminNotes: "  Bridge test  " }));
  expect(response.status).toBe(200);
  const { matchId } = await response.json();
  const rows = await t.run(ctx => ctx.db.query("matches").collect());
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ _id: matchId, ...pair, status: "new", interestType: "admin_suggested", initiatedBy: "admin_recommendation", adminNotes: "Bridge test" });
  expect(rows[0].matchNotificationSentAt).toBeUndefined();
  expect(rows[0].contactSharedNotificationSentAt).toBeUndefined();
  expect(await t.run(ctx => ctx.db.query("registrations").collect())).toEqual(before);
  for (const table of ["interests", "interestFlows", "interestFlowEvents", "profileShares"] as const) {
    expect(await t.run(ctx => ctx.db.query(table).collect())).toEqual([]);
  }
  expect(await t.run(ctx => ctx.db.system.query("_scheduled_functions").collect())).toEqual([]);
  expect(network).not.toHaveBeenCalled();
  const duplicate = await POST(request(pair));
  expect(duplicate.status).toBe(400);
  expect(await duplicate.json()).toEqual({ error: "An open match already exists for this pair. Open it in the workbench." });
  expect(await t.run(ctx => ctx.db.query("matches").collect())).toEqual(rows);
  const malformedId = await POST(request({ ...pair, maleRegistrationId: "invalid" }));
  expect(malformedId.status).toBe(400);
  expect(await malformedId.json()).toEqual({ error: genericError });
});

test("missing backend service credential fails closed with actionable 503", async () => {
  vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "");
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "Matching service is not configured. Contact support." });
  expect(mutation).not.toHaveBeenCalled();
});
