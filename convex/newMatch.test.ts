import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

const secret = "synthetic-new-match-secret";
beforeEach(() => vi.stubEnv("ADMIN_PASSWORD", secret));
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const base = { age: 30, maritalStatus: "single", education: "College", job: "Engineer", phone: "5550100", status: "approved" as const, profileCompletionStatus: "completed" as const, searchStatus: "active" as const, createdAt: 1 };
    const maleRegistrationId = await ctx.db.insert("registrations", { ...base, name: "Synthetic Man", gender: "male", email: "man@example.invalid", publicApplicantNumber: 101 });
    const femaleRegistrationId = await ctx.db.insert("registrations", { ...base, name: "Synthetic Woman", gender: "female", email: "woman@example.invalid", publicApplicantNumber: 102 });
    return { maleRegistrationId, femaleRegistrationId };
  });
  return { t, args: { ...ids, adminSecret: secret } };
}
// Snapshot every application table, not only matches: creation must not grant
// consent, reveal photos/contacts, mutate public identity, or queue email work.
async function snapshot(t: Awaited<ReturnType<typeof fixture>>["t"]) {
  return t.run(async ctx => ({
    tables: await Promise.all(Object.keys(schema.tables).map(async name => [name, await ctx.db.query(name as keyof typeof schema.tables).collect()])),
    scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
  }));
}

test("creates only an admin suggestion; no consent, sharing, registration or email side effects", async () => {
  const { t, args } = await fixture();
  const before = await snapshot(t);
  const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network forbidden in synthetic test"));
  const id = await t.mutation(api.matches.create, { ...args, adminNotes: "  Private admin note  " });
  const match = await t.run(ctx => ctx.db.get(id));
  expect(match).toEqual({ _id: id, _creationTime: expect.any(Number), maleRegistrationId: args.maleRegistrationId, femaleRegistrationId: args.femaleRegistrationId, status: "new", interestType: "admin_suggested", initiatedBy: "admin_recommendation", adminNotes: "Private admin note", createdAt: expect.any(Number), updatedAt: expect.any(Number) });
  const after = await snapshot(t);
  expect(after.tables.filter(([name]) => name !== "matches")).toEqual(before.tables.filter(([name]) => name !== "matches"));
  expect(after.scheduled).toEqual([]);
  expect(network).not.toHaveBeenCalled();
});

test.each(["", "wrong"])("rejects invalid admin secret %j without writes", async adminSecret => {
  const { t, args } = await fixture();
  const before = await snapshot(t);
  await expect(t.mutation(api.matches.create, { ...args, adminSecret })).rejects.toThrow("Unauthorized");
  expect(await snapshot(t)).toEqual(before);
});
test("fails closed when server password is absent", async () => {
  const { t, args } = await fixture();
  vi.stubEnv("ADMIN_PASSWORD", "");
  await expect(t.mutation(api.matches.create, args)).rejects.toThrow("Unauthorized");
  expect(await t.run(ctx => ctx.db.query("matches").collect())).toEqual([]);
});
test("missing credentials and malformed IDs are rejected by validators", async () => {
  const { t, args } = await fixture();
  const missingSecret = { maleRegistrationId: args.maleRegistrationId, femaleRegistrationId: args.femaleRegistrationId };
  for (const invalid of [missingSecret, { ...args, maleRegistrationId: "invalid" }, { ...args, adminNotes: 42 }]) {
    await expect(t.mutation(api.matches.create, invalid as typeof args)).rejects.toThrow();
  }
  expect(await t.run(ctx => ctx.db.query("matches").collect())).toEqual([]);
});

test.each(["maleRegistrationId", "femaleRegistrationId"] as const)("checks eligibility on %s", async side => {
  const patches: Partial<Doc<"registrations">>[] = [
    { status: "pending" }, { status: "rejected" },
    { profileCompletionStatus: undefined }, { profileCompletionStatus: "not_started" }, { profileCompletionStatus: "in_progress" },
    { searchStatus: "paused" }, { searchStatus: "inactive" },
  ];
  for (const patch of patches) {
    const { t, args } = await fixture();
    await t.run(ctx => ctx.db.patch(args[side], patch));
    const before = await snapshot(t);
    await expect(t.mutation(api.matches.create, args)).rejects.toThrow("Both applicants must be approved");
    expect(await snapshot(t)).toEqual(before);
  }
});

test("legacy absent search status is active; whitespace notes are omitted", async () => {
  const { t, args } = await fixture();
  await t.run(ctx => ctx.db.patch(args.maleRegistrationId, { searchStatus: undefined }));
  const id = await t.mutation(api.matches.create, { ...args, adminNotes: "   " });
  expect((await t.run(ctx => ctx.db.get(id)))?.adminNotes).toBeUndefined();
});

test.each(["self", "same-gender", "reversed", "missing"])("rejects %s applicants without writes", async kind => {
  const { t, args } = await fixture();
  if (kind === "self") args.femaleRegistrationId = args.maleRegistrationId;
  if (kind === "same-gender") await t.run(ctx => ctx.db.patch(args.femaleRegistrationId, { gender: "male" }));
  if (kind === "reversed") [args.maleRegistrationId, args.femaleRegistrationId] = [args.femaleRegistrationId, args.maleRegistrationId];
  if (kind === "missing") await t.run(ctx => ctx.db.delete(args.femaleRegistrationId));
  const before = await snapshot(t);
  await expect(t.mutation(api.matches.create, args)).rejects.toThrow(kind === "self" ? "different applicants" : kind === "missing" ? "no longer exists" : "one male and one female");
  expect(await snapshot(t)).toEqual(before);
});

test.each(["new", "reviewing", "contact_shared", "paused", "closed", "declined"] as const)("duplicate pair guard for %s", async status => {
  const { t, args } = await fixture();
  const id = await t.mutation(api.matches.create, args);
  await t.run(ctx => ctx.db.patch(id, { status }));
  if (status === "closed" || status === "declined") {
    expect(await t.mutation(api.matches.create, args)).not.toBe(id);
  } else {
    const before = await snapshot(t);
    await expect(t.mutation(api.matches.create, args)).rejects.toThrow("open match already exists");
    expect(await snapshot(t)).toEqual(before);
  }
});

test.each(["maleRegistrationId", "femaleRegistrationId"] as const)("rejects active match on %s", async side => {
  const { t, args } = await fixture();
  const id = await t.mutation(api.matches.create, args);
  await t.run(ctx => ctx.db.patch(args[side], { activeMatchId: id }));
  const before = await snapshot(t);
  await expect(t.mutation(api.matches.create, args)).rejects.toThrow("already has an active match");
  expect(await snapshot(t)).toEqual(before);
});

test("enforces 2,000-character notes boundary", async () => {
  const { t, args } = await fixture();
  await expect(t.mutation(api.matches.create, { ...args, adminNotes: "x".repeat(2001) })).rejects.toThrow("2,000 characters");
  expect(await t.run(ctx => ctx.db.query("matches").collect())).toEqual([]);
  const id = await t.mutation(api.matches.create, { ...args, adminNotes: "x".repeat(2000) });
  expect((await t.run(ctx => ctx.db.get(id)))?.adminNotes).toHaveLength(2000);
});
