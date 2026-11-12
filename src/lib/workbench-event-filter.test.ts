import { expect, test } from "vitest";
import { matchEventId, inEventScope, scopedWorkbenchRecords } from "./workbench-event-filter";
const interest = { _id: "i", eventId: "a", matchId: "m", fromRegistrationId: "man", toRegistrationId: "woman" };
const match = { _id: "m", interestId: "i", maleRegistrationId: "man", femaleRegistrationId: "woman", interest };
test("same participants at different events retain explicit provenance", () => {
 expect(matchEventId(match)).toBe("a");
 expect(inEventScope(matchEventId(match), "b")).toBe(false);
 expect(matchEventId({ ...match, interest: { ...interest, eventId: "b" } })).toBe("b");
});
test("unscoped, stale and corrupt links never belong to a named event", () => {
 for (const m of [{ ...match, interest: null }, { ...match, interestId: undefined }, { ...match, interest: { ...interest, matchId: "other" } }, { ...match, interest: { ...interest, fromRegistrationId: "other" } }, { ...match, interest: { ...interest, testReset: {} } }]) {
 expect(matchEventId(m)).toBe(null);
 expect(inEventScope(matchEventId(m), "a")).toBe(false);
 expect(inEventScope(matchEventId(m), "unscoped")).toBe(true);
 }
 expect(inEventScope("a", "unscoped")).toBe(false);
 expect(inEventScope(null, "all")).toBe(true);
});

test("detail actions cannot bypass event provenance; valid reciprocal interests keep their match", () => {
 const a = { ...interest, match: match };
 const reciprocal = { ...a, _id: "reciprocal", fromRegistrationId: "woman", toRegistrationId: "man" };
 const wrongEvent = { ...a, _id: "wrong-event", eventId: "b" };
 expect(scopedWorkbenchRecords([a, reciprocal, wrongEvent], [match], "a").interests.every(i => i.match?._id === "m")).toBe(true);
 expect(scopedWorkbenchRecords([wrongEvent], [match], "b").interests[0].match).toBe(null);
 expect(scopedWorkbenchRecords([wrongEvent], [match], "all").interests[0].match).toBe(null);
 const invalid = { ...match, interest: { ...interest, fromRegistrationId: "unrelated" } };
 expect(scopedWorkbenchRecords([a], [invalid], "unscoped").matches[0].interest).toBe(null);
 expect(scopedWorkbenchRecords([a], [invalid], "all").interests[0].match).toBe(null);
});

test("reset audit records are excluded before event normalization without changing source data", () => {
 const resetInterest = { ...interest, match: match, testReset: { resetAt: 1 } };
 const resetMatch = { ...match, interest: resetInterest };
 const source = JSON.stringify([resetInterest, resetMatch]);
 for (const scope of ["all", "a", "unscoped"]) {
  expect(scopedWorkbenchRecords([resetInterest], [resetMatch], scope)).toEqual({ interests: [], matches: [] });
  expect(scopedWorkbenchRecords([], [{ ...match, interest: null, testResetAt: 0 }], scope).matches).toEqual([]);
 }
 expect(JSON.stringify([resetInterest, resetMatch])).toBe(source);
});

test("ordinary history and new test profiles remain selectable, reset matches cannot leak through interest actions", () => {
 for (const status of ["new", "pending", "closed", "declined", "withdrawn"]) {
  const i = { ...interest, match, status };
  const result = scopedWorkbenchRecords([i], [{ ...match, status }], "all");
  expect(result.interests.map(i => i._id)).toEqual(["i"]);
  expect(result.matches.map(m => m._id)).toEqual(["m"]);
 }
 const result = scopedWorkbenchRecords([{ ...interest, match }], [{ ...match, testResetAt: 1 }], "all");
 expect(result.interests[0].match).toBe(null);
 expect(result.matches.find(m => m._id === "m")).toBeUndefined();
 expect(scopedWorkbenchRecords([{ ...interest, match, testReset: {} }], [], "all").interests).toEqual([]);
});
