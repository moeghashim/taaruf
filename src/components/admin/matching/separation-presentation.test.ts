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
test("issue66 header removes the global manual suggestion launcher", () => {
  const html = renderToStaticMarkup(createElement(Topbar, { crumb: "Interests", onMenu: vi.fn() }));
  expect(html).not.toContain('aria-label="New match"');
});
test("issue66 derives lifecycle and removes historical priority without losing safe actions", () => {
  const html = renderToStaticMarkup(createElement(InterestsPageClient));
  expect(html).not.toContain("Historical tracker: ");
  expect(html).not.toContain("Match creation is automatic after both applicant approvals");
  expect(html).not.toContain("Queued");
  expect(html).toContain("Awaiting applicant approvals");
  expect(html).toContain("Decline interest");
  expect(html).toContain("Close interest");
  expect(html).toContain("Interest notes...");
  expect(html).not.toContain(">Convert<");
  expect(html).not.toContain(">Progress<");
  expect(html).not.toContain("Archive mode");
});
