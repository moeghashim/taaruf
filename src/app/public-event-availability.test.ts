// @vitest-environment node
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/convex", () => ({ getConvexClient: () => ({ query }) }));
import Home from "./page";

beforeEach(() => { query.mockReset(); });

for (const femaleWaitlisted of [false, true]) {
  for (const maleWaitlisted of [false, true]) {
    test(`60/60 event shows status, never remaining counts (sisters waitlist=${femaleWaitlisted}, brothers waitlist=${maleWaitlisted})`, async () => {
      query.mockResolvedValue([{
        _id: "fixture", title: "Workshop", eventCode: "nov26", location: "ROIC",
        startsAt: Date.UTC(2026, 10, 14, 18, 45),
        femaleAvailable: 16, maleAvailable: 39, femaleCapacity: 60, maleCapacity: 60,
        femaleWaitlisted, maleWaitlisted,
      }]);
      const html = renderToStaticMarkup(await Home());
      expect(html).toContain(`Sisters ${femaleWaitlisted ? "waitlist" : "open"}`);
      expect(html).toContain(`Brothers ${maleWaitlisted ? "waitlist" : "open"}`);
      expect(html).not.toMatch(/(?:Sisters|Brothers)\s*\d|(?:16|39|60) (?:open|available|spots)/);
      expect(html).not.toContain("femaleAvailable");
      expect(html).not.toContain("maleAvailable");
      expect(html).toContain('/register/nov26');
      expect(html).toContain("Apply to attend");
    });
  }
}

test("public registration and applicant surfaces do not reference gender availability counts", () => {
  for (const file of ["src/app/page.tsx", "src/app/register/page.tsx", "src/app/register/[eventCode]/page.tsx", "src/components/registration-form.tsx", "src/app/me/page.tsx"]) {
    const source = readFileSync(file, "utf8");
    expect(source).not.toMatch(/(?:male|female)(?:Available|Capacity)|counts\.(?:male|female)/);
  }
  const portal = readFileSync("src/app/me/page.tsx", "utf8");
  expect(portal).toContain('value={event.registration.registrationStatus}');
  expect(portal).toContain('canConfirmEventRegistration(event.registration)');
  expect(portal).toContain('move to Pending for review');
});

test("admin retains operational gender capacity and waitlist counts", () => {
  const source = readFileSync("src/components/admin/events/events-page-client.tsx", "utf8");
  expect(source).toContain('M {event.counts.malePending + event.counts.maleApproved}/{event.maleCapacity}');
  expect(source).toContain('F {event.counts.femalePending + event.counts.femaleApproved}/{event.femaleCapacity}');
  expect(source).toContain('WL {event.counts.maleWaitlisted + event.counts.femaleWaitlisted}');
});
