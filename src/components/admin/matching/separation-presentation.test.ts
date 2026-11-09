// @vitest-environment node
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/admin/hooks/use-admin-transport", () => ({
  refreshAdminData: vi.fn(), useAdminMutation: () => vi.fn(),
  useAdminQuery: (name: string) => name === "interests.getAll" ? [{
    _id: "interest", _creationTime: 1, createdAt: 1, updatedAt: 1,
    status: "queued", adminStatus: "requested", visibility: "admin_actionable", source: "email",
    fromRegistrationId: "male", toRegistrationId: "female", eventId: "event",
    fromRegistration: null, toRegistration: null, event: null, match: null,
  }] : [],
}));
import { Topbar } from "../layout/topbar";
import { InterestsPageClient } from "./matching-page-client";
test("compatibility header retains the safe admin-only suggestion launcher", () => {
  const html = renderToStaticMarkup(createElement(Topbar, { crumb: "Interests", onMenu: vi.fn() }));
  expect(html).toContain('aria-label="New match"');
});
test("compatibility interest row exposes historical priority without consent-changing controls", () => {
  const html = renderToStaticMarkup(createElement(InterestsPageClient));
  expect(html).toContain("Historical tracker: ");
  expect(html).toContain("Match creation is automatic after both applicant approvals");
  expect(html).toContain("Queued");
  expect(html).toContain("Decline interest");
  expect(html).toContain("Close interest");
  expect(html).toContain("Interest notes...");
  expect(html).not.toContain(">Convert<");
  expect(html).not.toContain(">Progress<");
  expect(html).not.toContain("Archive mode");
});
