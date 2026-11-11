// @vitest-environment node
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams("event=manual") }));
vi.mock("@/components/admin/hooks/use-admin-transport", () => ({ refreshAdminData: vi.fn(), useAdminMutation: () => vi.fn(), useAdminQuery: () => [] }));
vi.mock("@/components/admin/hooks/use-profile-event-pages", () => ({ useProfileEventPages: () => ({ rows: [], retry: vi.fn() }) }));
import { WorkbenchPageClient } from "./matching-page-client";
test("workbench retains its own accessible creation action before filtered records", () => {
  const html = renderToStaticMarkup(createElement(WorkbenchPageClient));
  expect(html.match(/aria-label="New match"/g)).toHaveLength(1);
  expect(html).toContain('aria-label="Match creation"');
  expect(html).toContain('aria-label="Event filter"');
  expect(html.indexOf('aria-label="Match creation"')).toBeLessThan(html.indexOf('aria-label="Event filter"'));
  expect(html).toContain("Start a private draft");
});
