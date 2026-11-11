import { expect, test } from "vitest";
import { isManualMatchDraft } from "./manual-match-draft";
const draft = { interestType: "admin_suggested", initiatedBy: "admin_recommendation" };
test("draft identity survives status changes but never reclassifies historical contact release", () => {
  for (const status of ["new", "reviewing", "paused", "closed", "declined"]) expect(isManualMatchDraft({ ...draft, status })).toBe(true);
  for (const history of [{ status: "contact_shared" }, { status: "paused", contactGate: "contacts_released" }, { status: "closed", adminReleasedAt: 1 }, { interestId: "official-interest" }]) expect(isManualMatchDraft({ ...draft, ...history })).toBe(false);
  expect(isManualMatchDraft(null)).toBe(false);
});
