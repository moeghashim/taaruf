// @vitest-environment node
import { createElement, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";
import type { Doc } from "../../../../convex/_generated/dataModel";
vi.mock("react", async importOriginal => ({ ...await importOriginal<typeof import("react")>(), useState: (value: unknown) => [value, vi.fn()] }));
vi.mock("@/components/admin/hooks/use-admin-transport", () => ({ refreshAdminData: vi.fn(), useAdminMutation: () => vi.fn(), useAdminQuery: () => [] }));
import { ContactRelease } from "./matching-page-client";
import { FemaleWorkflowActions } from "./female-workflow-actions";
import { interestLifecycle, isArchivedInterest } from "@/lib/interest-lifecycle";
const match = { _id: "match", interestId: "interest", status: "reviewing", contactGate: "pending_admin_approval" } as Doc<"matches">;
const fetchMock = vi.fn();
beforeEach(() => { vi.stubGlobal("fetch", fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({}) })); vi.stubGlobal("window", { confirm: vi.fn(() => true) }); });
function buttons(node: unknown): ReactElement<{ children?: unknown; onClick?: () => unknown }>[] {
  if (Array.isArray(node)) return node.flatMap(buttons);
  if (!isValidElement<{ children?: unknown }>(node)) return [];
  return node.type === "button" ? [node] : buttons(node.props.children);
}
test("female requester action uses authenticated review creation, never prioritization", async () => {
  const tree = FemaleWorkflowActions({ interestId: "interest", state: "private_documented" });
  const button = buttons(tree).find(b => b.props.children === "Create review link")!;
  expect(button).toBeDefined(); await button.props.onClick!();
  expect(fetchMock).toHaveBeenCalledWith("/api/admin/female-review", expect.objectContaining({ body: JSON.stringify({ action: "create", interestId: "interest" }) }));
});
test("contact release renders only for an approved official match", () => {
  for (const invalid of [null, { ...match, interestId: undefined }, { ...match, contactGate: undefined }, { ...match, status: "closed" }, { ...match, status: "contact_shared" }, { ...match, testResetAt: 1 }]) {
    expect(renderToStaticMarkup(createElement(ContactRelease, { match: invalid as Doc<"matches"> | null, onMessage: vi.fn() }))).not.toContain("Final admin approval");
  }
  expect(renderToStaticMarkup(createElement(ContactRelease, { match, onMessage: vi.fn() }))).toContain("Final admin approval");
});
for (const femaleInterestId of [undefined, "interest"]) test("release confirms and calls correct audited route: " + femaleInterestId, async () => {
  const button = ContactRelease({ match, femaleInterestId, onMessage: vi.fn() })!;
  await button.props.onClick();
  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("final admin release of contacts"));
  expect(fetchMock).toHaveBeenCalledWith(femaleInterestId ? "/api/admin/female-review" : "/api/admin/share-contacts", expect.objectContaining({ body: JSON.stringify(femaleInterestId ? { action: "release", interestId: "interest" } : { matchId: "match" }) }));
});
test("cancel release makes no request", async () => {
  vi.mocked(window.confirm).mockReturnValue(false);
  await ContactRelease({ match, onMessage: vi.fn() })!.props.onClick();
  expect(fetchMock).not.toHaveBeenCalled();
});
test("derived state ignores administrative priority and preserves awaiting-release visibility", () => {
  for (const status of ["new", "active", "queued"] as const) expect(interestLifecycle({ status })).toBe("Awaiting applicant approvals");
  expect(isArchivedInterest({ status: "converted_to_match", match })).toBe(false);
  expect(interestLifecycle({ status: "converted_to_match", match })).toBe("Both approved — awaiting contact release");
  expect(isArchivedInterest({ status: "converted_to_match", match: { ...match, contactGate: "contacts_released" } })).toBe(true);
});
