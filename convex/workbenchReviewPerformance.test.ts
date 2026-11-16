import { expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import type { QueryCtx } from "./_generated/server";
import schema from "./schema";
import { modules } from "./test.setup";
import { createWorkbenchReviewContext, workbenchReview } from "./workbenchReview";

// Count actual terminal database operations/documents, outside the memoized layer.
function instrument(ctx: QueryCtx) {
  const stats = { gets: 0, queries: 0, documents: 0, events: 0 };
  const db = new Proxy(ctx.db, { get(target, key, receiver) {
    if (key === "get") return async (...args: unknown[]) => {
      stats.gets++;
      const value = await Reflect.apply(target.get, target, args);
      if (value) stats.documents++;
      return value;
    };
    if (key !== "query") return Reflect.get(target, key, receiver);
    return (table: string) => {
      const wrap = (query: object): object => new Proxy(query, { get(q, operation) {
        return (...args: unknown[]) => {
          const value = Reflect.apply(Reflect.get(q, operation), q, args);
          if (!["collect", "take", "unique", "first"].includes(String(operation))) return wrap(value as object);
          stats.queries++;
          if (table === "interestFlowEvents") stats.events++;
          return Promise.resolve(value).then(rows => {
            stats.documents += Array.isArray(rows) ? rows.length : rows ? 1 : 0;
            return rows;
          });
        };
      } });
      return wrap(Reflect.apply(target.query, target, [table]));
    };
  } });
  return { ctx: { ...ctx, db }, stats };
}

for (const count of [100, 101]) test(count + " shared-participant rows stay inside the read budget", async () => {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const eventId = await ctx.db.insert("events", { title: "Synthetic", eventCode: "synthetic", eventMonth: "2026-11", series: "1plus1_match", location: "Test", startsAt: 1, endsAt: 2, status: "completed", maleCapacity: 10, femaleCapacity: 10, createdAt: 1, updatedAt: 1 });
    const people = [];
    for (const [i, gender] of (["male", "female"] as const).entries()) people.push(await ctx.db.insert("registrations", { name: "Synthetic", publicApplicantNumber: i + 1, gender, age: 30, maritalStatus: "single", education: "College", job: "Test", email: i + "@example.invalid", phone: "5550100", status: "approved", createdAt: 1 }));
    const [fromRegistrationId, toRegistrationId] = people;
    const rows = [];
    for (let i = 0; i < count; i++) {
      const interestId = await ctx.db.insert("interests", { eventId, fromRegistrationId, toRegistrationId, source: "platform_submission", status: "new", visibility: "admin_actionable", createdAt: i + 2, updatedAt: 2 });
      await ctx.db.insert("interestFlows", { interestId, fromRegistrationId, toRegistrationId, flowStatus: "bio_review", recipientDecision: "accepted", requesterFinalApproval: "approved", requesterExplicitFinalAt: 10, recipientFinalApproval: "pending", photoDecision: "pending", createdAt: 2, updatedAt: 2 });
      rows.push(interestId);
    }
    // Significant shared history: must not be re-read for each page row.
    for (let i = 0; i < 200; i++) await ctx.db.insert("matches", { maleRegistrationId: fromRegistrationId, femaleRegistrationId: toRegistrationId, interestType: "mutual_interest", initiatedBy: "interest_signal", status: "declined", createdAt: 1, updatedAt: 1 });
    return rows;
  });
  await t.run(async ctx => {
    const rows = await Promise.all(ids.map(id => ctx.db.get(id)));
    const measured = instrument(ctx);
    const cached = createWorkbenchReviewContext(measured.ctx);
    const labels = await Promise.all(rows.map(row => workbenchReview(cached, row!)));
    expect(labels.every(r => r.label === "Waiting on sister #2 — Final approval (brother approved)")).toBe(true);
    expect(measured.stats.gets).toBe(2);
    expect(measured.stats.events).toBe(0);
    expect(measured.stats.queries).toBe(2 * count + 8);
    expect(measured.stats.documents).toBe(2 * count + 402);
    // A fresh context re-reads: no process-wide stale result cache.
    await workbenchReview(createWorkbenchReviewContext(measured.ctx), rows[0]!);
    expect(measured.stats.gets).toBe(4);
  });
  if (count === 101) {
    // Canonical on page one, reverse alias on page two; no page-local alias assumption.
    await t.run(async ctx => {
      const canonical = (await ctx.db.get(ids[0]))!;
      await ctx.db.patch(ids[100], { fromRegistrationId: canonical.toRegistrationId, toRegistrationId: canonical.fromRegistrationId, canonicalInterestId: ids[0] });
      const flow = await ctx.db.query("interestFlows").withIndex("by_interestId", q => q.eq("interestId", ids[100])).unique();
      await ctx.db.patch(flow!._id, { fromRegistrationId: canonical.toRegistrationId, toRegistrationId: canonical.fromRegistrationId, requesterFinalApproval: "pending", requesterExplicitFinalAt: undefined });
    });
    vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "synthetic");
    try {
      const first = await t.query(api.interests.workbenchPage, { adminSecret: "synthetic", paginationOpts: { numItems: 100, cursor: null } });
      const second = await t.query(api.interests.workbenchPage, { adminSecret: "synthetic", paginationOpts: { numItems: 100, cursor: first.continueCursor } });
      expect(first.page).toHaveLength(100);
      expect(second.page).toHaveLength(1);
      expect(second.page[0].workbenchReview).toEqual(first.page[0].workbenchReview);
      expect(second.page[0].workbenchReview.label).toBe("Waiting on sister #2 — Final approval (brother approved)");
    } finally { vi.unstubAllEnvs(); }
  }
});
