import { describe, expect, test } from "vitest";
import { mutualEvidence } from "./mutualInterest";
import type { Doc } from "./_generated/dataModel";
type Row = Parameters<typeof mutualEvidence>[0][number];
const row = (id: string, from = "a", to = "b", overrides: Partial<Row> = {}): Row => ({ _id: id, _creationTime: 1, fromRegistrationId: from, toRegistrationId: to, eventId: "e", source: "platform_submission", status: "new", visibility: "admin_actionable", createdAt: 1, updatedAt: 1, match: null, participantsExist: true, eventExists: true, ...overrides } as Row);
const match = (overrides: Partial<Doc<"matches">> = {}) => ({ _id: "m", maleRegistrationId: "a", femaleRegistrationId: "b", interestId: "i", interestType: "mutual_interest", status: "new", ...overrides } as Doc<"matches">);
describe("actual same-event directional evidence", () => {
 test("approval type alone never establishes mutual", () => expect(mutualEvidence([row("i", "a", "b", { match: match(), matchId: "m" as Doc<"matches">["_id"] })]).size).toBe(0));
 test.each(["platform_submission", "email", "whatsapp", "admin_entered"] as const)("includes %s reverse evidence", source => {
  const result = mutualEvidence([row("i"), row("r", "b", "a", { source })]);
  expect(result.get("i")?.state).toBe("open"); expect(result.get("i")?.submissions).toHaveLength(2);
 });
 test("does not combine different events", () => expect(mutualEvidence([row("i"), row("r", "b", "a", { eventId: "other" as Row["eventId"] })]).size).toBe(0));
 test.each(["withdrawn", "closed", "declined"] as const)("excludes %s", status => expect(mutualEvidence([row("i"), row("r", "b", "a", { status })]).size).toBe(0));
 test.each([{ testReset: { at: 1, actor: "admin" as const, reason: "test" } }, { participantsExist: false }, { eventExists: false }, { femaleWorkflow: { state: "revoked" as const } }, { match: match({ testResetAt: 1 }) }])("excludes missing/reset/revoked evidence %j", overrides => expect(mutualEvidence([row("i"), row("r", "b", "a", overrides)]).size).toBe(0));
 test("retains contact-shared history only with both records", () => {
  const i = row("i", "a", "b", { status: "converted_to_match", match: match({ contactGate: "contacts_released", status: "closed" }), matchId: "m" as Row["matchId"] });
  expect(mutualEvidence([i, row("r", "b", "a", { match: i.match, matchId: i.matchId })]).get("i")?.state).toBe("completed");
  expect(mutualEvidence([i, row("new-reverse", "b", "a")]).size).toBe(0);
  expect(mutualEvidence([i]).size).toBe(0);
 });
 test("closed released records retain completed evidence", () => {
  const m = match({ contactGate: "contacts_released", status: "closed" });
  const overrides = { status: "closed" as const, match: m, matchId: m._id };
  expect(mutualEvidence([row("i", "a", "b", overrides), row("r", "b", "a", overrides)]).get("i")?.state).toBe("completed");
 });
 test("cancelled event cannot be currently mutual", () => expect(mutualEvidence([row("i", "a", "b", { eventCancelled: true }), row("r", "b", "a", { eventCancelled: true })]).size).toBe(0));
 test("handles reverse record beyond 1000 without page assumptions", () => {
  const rows = Array.from({ length: 1005 }, (_, n) => row(String(n)));
  rows.push(row("r", "b", "a"));
  expect(mutualEvidence(rows).size).toBe(1006);
 });
});
