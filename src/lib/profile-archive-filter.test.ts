import { expect, test } from "vitest";
import { isArchivedProfile, matchesProfileListStatus } from "./profile-archive-filter";

const profiles = ["approved", "pending", "rejected"].flatMap((status, i) => [
  { _id: status, status, gender: "female", archivedAt: i, name: "Synthetic archive" },
  { _id: status + "-active", status, gender: "male", name: "Synthetic active" },
]);
test("archive is presence of timestamp (including zero), not approval status", () => {
  expect(isArchivedProfile({})).toBe(false);
  expect(isArchivedProfile({ archivedAt: 0 })).toBe(true);
  expect(profiles.filter(p => matchesProfileListStatus(p, "archived"))).toHaveLength(3);
  expect(profiles.filter(p => matchesProfileListStatus(p, "all"))).toHaveLength(6);
  for (const status of ["approved", "pending", "rejected"] as const) {
    expect(profiles.filter(p => matchesProfileListStatus(p, status))).toHaveLength(2);
  }
  expect(profiles.map(p => p.status)).toEqual(["approved", "approved", "pending", "pending", "rejected", "rejected"]);
});
test("synthetic event-membership predicate composes independently without eligibility reinterpretation", () => {
  // Issue67 interface inspected read-only: ReadonlyMap<registrationId, readonly status[]>.
  // Not an import/cherry-pick of its active writer; actual combined UI remains an integration gate.
  const membership = new Map([["approved", ["withdrawn", "approved"]], ["pending", ["rejected"]], ["approved-active", ["approved"]]]);
  const result = profiles.filter(p => matchesProfileListStatus(p, "archived") && membership.has(p._id) && p.gender === "female" && p.name.toLowerCase().includes("archive"));
  expect(result.map(p => p._id)).toEqual(["approved", "pending"]);
  expect(new Set(result.map(p => p._id)).size).toBe(result.length);
  expect(membership.get("approved")).toEqual(["withdrawn", "approved"]);
});
