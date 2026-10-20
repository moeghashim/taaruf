import { expect, test } from "vitest";
import { formatEventDate } from "../src/lib/event-date";
test("Real Talk uses Central date and time instead of UTC", () => {
 expect(formatEventDate(1792544400000)).toBe("Tuesday, October 20 at 8:00 PM CDT");
});
test("Central display observes standard time in winter", () => {
 expect(formatEventDate(Date.parse("2026-12-21T02:00:00Z"))).toBe("Sunday, December 20 at 8:00 PM CST");
});
