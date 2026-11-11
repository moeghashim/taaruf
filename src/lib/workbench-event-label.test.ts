import { describe, expect, it } from "vitest";
import { workbenchEventLabel } from "./workbench-event-label";
describe("workbench event labels", () => {
  it.each([
    ["2026-11-15T01:00:00Z", "Nov 14, 2026"],
    ["2026-06-15T04:30:00Z", "Jun 14, 2026"],
    ["2027-01-01T01:00:00Z", "Dec 31, 2026"],
  ])("uses Central date including year for %s", (iso, expected) => {
    expect(workbenchEventLabel({ title: "Real Talk", startsAt: Date.parse(iso) })).toBe(`Real Talk — ${expected}`);
  });
  it.each([undefined, null, NaN, Infinity])("handles missing/invalid date %s", startsAt => {
    expect(workbenchEventLabel({ title: "Real Talk", startsAt })).toBe("Real Talk — Date unavailable");
  });
  it("accepts epoch zero rather than treating it as missing", () => {
    expect(workbenchEventLabel({ title: "Event", startsAt: 0 })).toBe("Event — Dec 31, 1969");
  });
});
