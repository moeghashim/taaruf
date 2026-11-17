import { describe, expect, test } from "vitest";
import { adminInterestStage, changeInterestStatus, clickInterestStat, emptyInterestFilters as all, interestCounts, matchesInterestFilters, type FilterableInterest } from "./admin-interest-filters";
const row = (patch: Partial<FilterableInterest> = {}): FilterableInterest => ({ status: "new", eventId: "event-a" as FilterableInterest["eventId"], visibility: "admin_actionable", source: "platform_submission", fromRegistration: { name: "Synthetic Adam", publicApplicantNumber: 9101, gender: "male" }, toRegistration: { name: "Synthetic Sara", publicApplicantNumber: 9102, gender: "female" }, workbenchReview: { label: "Waiting on sister #9102 — Initial bio decision" }, ...patch });
describe("canonical lifecycle", () => {
  test.each(["closed", "declined", "withdrawn"] as const)("%s is closed without canonical projection", status => expect(adminInterestStage(row({ status, workbenchReview: null }))).toBe("closed"));
  test.each(["Queued — reason; Waiting on both — Final approval", "Deferred — reason"])("%s is queued", label => expect(adminInterestStage(row({ workbenchReview: { label } }))).toBe("queued"));
  test.each(["Waiting on both — Final approval: brother #9101 and sister #9102", "Waiting on brother #9101 — Final approval (sister approved)", "Admin action — Review and release contacts (both final approvals saved)"])("explicit approval %s", label => expect(adminInterestStage(row({ workbenchReview: { label } }))).toBe("waiting"));
  test.each(["Admin check — Final approval lacks provenance", "Blocked — Other match; Waiting on both — Final approval", "Paused — Linked match paused", "Admin action — Share brother #9101’s profile for review"])("%s remains open, not approval", label => expect(adminInterestStage(row({ workbenchReview: { label } }))).toBe("other"));
  test("refund, test reset, linked closure and release remain closed", () => {
    for (const patch of [{ adminRemovedAt: 0 }, { testReset: true }, { match: { status: "closed" } }, { match: { status: "contact_shared" } }]) expect(adminInterestStage(row({ ...patch, workbenchReview: null } as Partial<FilterableInterest>))).toBe("closed");
  });
  test("converted missing match is not silently dropped; paused released match stays open", () => {
    expect(adminInterestStage(row({ status: "converted_to_match", workbenchReview: { label: "Admin check — Linked match missing" } }))).toBe("other");
    expect(adminInterestStage(row({ workbenchReview: { label: "Paused — Linked match paused" }, match: { status: "paused", contactGate: "contacts_released" } }))).toBe("other");
  });
});
test("all dimensions compose, gender belongs to submitting applicant", () => {
  const filters = { ...all, status: "open" as const, substatus: "waiting" as const, gender: "male" as const, search: "sArA", event: "event-a", visibility: "admin_actionable" as const, mutualOnly: true };
  expect(matchesInterestFilters(row({ mutual: {} }), filters)).toBe(true);
  expect(matchesInterestFilters(row({ mutual: {} }), { ...filters, gender: "female" })).toBe(false);
  expect(matchesInterestFilters(row({ mutual: {} }), { ...filters, event: "event-b" })).toBe(false);
  expect(matchesInterestFilters(row(), filters)).toBe(false);
});
test.each(["9101", "#9102", "Applicant #9102", "applicant 9101", "  synthetic SARA  "])("search %s finds either side", search => expect(matchesInterestFilters(row(), { ...all, search })).toBe(true));
test("numbers are exact public numbers, not internal ids or partial guesses", () => {
  expect(matchesInterestFilters(row(), { ...all, search: "910" })).toBe(false);
  expect(matchesInterestFilters(row({ fromRegistration: null, toRegistration: null }), { ...all, search: "9101" })).toBe(false);
});
test("counts stay global across filters and reactive snapshot changes", () => {
  const rows = [row(), row({ status: "closed", workbenchReview: { label: "Closed — Interest closed" } }), row({ status: "queued", workbenchReview: null }), row({ fromRegistration: { name: "Synthetic Sara", gender: "female", publicApplicantNumber: 9102 } })];
  const before = interestCounts(rows);
  expect(before).toEqual({ total: 4, open: 3, waiting: 2, queued: 1, closed: 1, male: 3, female: 1 });
  for (const stat of ["open", "closed", "male", "female", "waiting", "queued"] as const) {
    rows.filter(r => matchesInterestFilters(r, clickInterestStat({ ...all, search: "not found" }, stat)));
    expect(interestCounts(rows)).toEqual(before);
  }
  const after = interestCounts(rows.map((r, i) => i === 0 ? { ...r, status: "closed" as const, workbenchReview: { label: "Closed — Interest closed" } } : r));
  expect(after).toEqual({ ...before, open: 2, waiting: 1, closed: 2 });
});
test("stat clicks retain other dimensions; Total and clear reset everything", () => {
  const selected = { ...all, gender: "female" as const, event: "event-a", search: "Sara", mutualOnly: true };
  expect(clickInterestStat(selected, "queued")).toEqual({ ...selected, status: "open", substatus: "queued" });
  expect(clickInterestStat(clickInterestStat(selected, "queued"), "closed")).toEqual({ ...selected, status: "closed", substatus: "all" });
  expect(clickInterestStat(selected, "total")).toEqual(all);
  expect(changeInterestStatus({ ...selected, substatus: "waiting" }, "all").substatus).toBe("all");
});
test("all records, including beyond first page, contribute once", () => {
  const rows = Array.from({ length: 251 }, (_, i) => row({ status: i < 250 ? "closed" : "new", workbenchReview: { label: i < 250 ? "Closed — Interest closed" : "Waiting on sister #9102 — Initial bio decision" } }));
  expect(interestCounts(rows)).toMatchObject({ total: 251, closed: 250, waiting: 1 });
  expect(rows.filter(r => matchesInterestFilters(r, { ...all, status: "open" }))).toHaveLength(1);
});

test("canonical paused and admin-check projections override stale raw completion", () => {
 for (const [label, patch] of [["Paused — Linked match paused", { femaleWorkflow: { state: "contacts_released" } }], ["Admin check — Linked match pair mismatch", { match: { status: "contact_shared" } }], ["Admin check — Applicant archived or unavailable", { match: { status: "closed" } }]] as const) expect(adminInterestStage(row({ ...patch, workbenchReview: { label } } as Partial<FilterableInterest>))).toBe("other");
});
