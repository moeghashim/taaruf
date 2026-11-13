import { expect, test, type Page } from "@playwright/test";

// Synthetic, read-only browser fixtures. Run against an isolated local app only.
const origin = process.env.PORTAL_BASE!;
test.use({ baseURL: origin, serviceWorkers: "block" });
const ordinary = (interestId: string, direction = "outbound") => ({
  interestId, direction, status: "new", flowStatus: "pending", visibility: "basic",
  ownFinalApproval: "pending", canRespond: false, canFinalApprove: false, canWithdraw: true,
  counterparty: { label: "Synthetic " + interestId, age: 30, gender: "male", imageUrls: [], fullProfileVisible: false },
});
const review = (role: string, mutualInterest = false) => ({ interestId: "workflow", role,
  state: "in_review", canView: true, ownAction: "review", ownActionStage: role === "sister" ? "final" : "initial",
  ownDecision: "pending", paused: false, mutualInterest });
type Options = { role?: string; mutual?: boolean; receipt?: boolean; empty?: boolean; error?: number; expired?: boolean; listError?: boolean };
async function fixture(page: Page, options: Options = {}) {
  const role = options.role ?? "sister";
  const rows = options.empty ? [] : [{ ...review(role, options.mutual), reviewExpired: options.expired }];
  const gets: string[] = [], writes: string[] = [];
  await page.routeWebSocket("**/*", socket => socket.close());
  await page.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (request.method() !== "GET") { writes.push(url.pathname); return route.fulfill({ status: 403, json: {} }); }
    if (url.pathname === "/api/applicant/me") return route.fulfill({ json: {
      applicant: { name: "Synthetic Applicant", gender: role === "sister" ? "female" : "male", status: "approved", applicantNumber: 999, profileCompletionStatus: "completed" },
      inbound: [ordinary("incoming", "inbound")],
      outbound: [options.receipt ? { ...ordinary("receipt"), receiptOnly: true, counterparty: null, canWithdraw: false } : ordinary("outgoing")],
      privateDocumented: role === "sister" ? [ordinary("private", "private")] : [], history: [],
      canSubmitInterest: false, interestSubmissionLimit: 3, interestSubmissions: [],
    } });
    if (url.pathname === "/api/applicant/profile") return route.fulfill({ json: { registration: { name: "Synthetic Applicant", gender: role === "sister" ? "female" : "male", imageUrls: [], imageStorageIds: [], interestSubmissionNumbers: [] } } });
    if (url.pathname === "/api/applicant/events") return route.fulfill({ json: { upcoming: [], history: [], eligibleInterestEvents: [] } });
    if (url.pathname === "/api/applicant/matchmaker") return route.fulfill({ json: { optedIn: true, matches: [] } });
    if (url.pathname === "/api/applicant/interest-eligibility") return route.fulfill({ json: { canSubmitInterest: false } });
    if (url.pathname === "/api/applicant/female-review") {
      const id = url.searchParams.get("interestId");
      if (!id) return route.fulfill({ status: options.listError ? 503 : 200, json: options.listError ? { error: "List unavailable" } : { page: rows, isDone: true, continueCursor: "" } });
      gets.push(id);
      return route.fulfill({ status: options.error ?? 200, json: options.error ? { error: "This review is unavailable." } : { ...review(role, options.mutual), profile: { label: "Authorized workflow", imageUrls: [], shareableBio: "Synthetic authorized bio" } } });
    }
    return route.fulfill({ status: 404, json: { error: "Unmocked API blocked" } });
  });
  return { gets, writes };
}
for (const width of [390, 1280]) {
  test.describe(width + "px", () => {
    test.use({ viewport: { width, height: 900 } });
    for (const role of ["sister", "brother"]) test(role + " mixed default has one detail; explicit ordinary selection and Back win", async ({ page }) => {
      const state = await fixture(page, { role, mutual: role === "brother" });
      await page.goto("/me#inbound-interests");
      await expect(page.getByText("Synthetic authorized bio")).toBeVisible();
      await expect(page.locator(".applicant-sections .interest-detail-panel")).toHaveCount(1);
      await expect(page.locator("#inline-review-workflow")).not.toBeFocused();
      const id = role === "sister" ? "private" : "outgoing";
      await page.locator('button[data-interest-id="' + id + '"]').click();
      await expect(page).toHaveURL(new RegExp("connection=" + id));
      await expect(page.locator(".applicant-sections .interest-detail-panel")).toHaveCount(1);
      await expect(page.locator(".interest-detail-panel h3", { hasText: "Synthetic " + id })).toBeVisible();
      await expect(page.locator('button[data-interest-id="' + id + '"]')).toBeFocused();
      await page.goBack();
      await expect(page.getByText("Synthetic authorized bio")).toBeVisible();
      await expect(page.locator(".applicant-sections .interest-detail-panel")).toHaveCount(1);
      await page.locator('button[data-interest-id="workflow"]').click();
      await expect(page.locator("#inline-review-workflow")).toBeFocused();
      await expect(page.locator("#inline-review-workflow")).toBeInViewport();
      // Revalidation must not reclaim focus from an unrelated control.
      await page.locator('button[data-interest-id="workflow"]').focus();
      const previousGets = state.gets.length;
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect.poll(() => state.gets.length).toBeGreaterThan(previousGets);
      await expect(page.locator('button[data-interest-id="workflow"]')).toBeFocused();
      expect(state.writes).toEqual([]);
    });
    test("receipt-only Outbound uses one compact column", async ({ page }) => {
      await fixture(page, { receipt: true, mutual: true });
      await page.goto("/me#outbound-interests");
      const workspace = page.locator("#outbound-interests .interest-workspace");
      await expect(workspace.getByText("Your submission has been recorded.")).toBeVisible();
      await expect(workspace.locator(".interest-detail-panel")).toHaveCount(0);
      await expect(workspace).toHaveCSS("min-height", "0px");
      expect((await workspace.boundingBox())!.height).toBeLessThan(200);
      const columns = await workspace.evaluate(el => getComputedStyle(el).gridTemplateColumns);
      expect(columns.trim().split(/\s+/)).toHaveLength(1);
    });
    for (const error of [400, 403, 404, 409, 410, 500]) test("stale explicit review recovery HTTP " + error, async ({ page }) => {
      const state = await fixture(page, { empty: true, error, listError: error === 500 });
      await page.goto("/me?femaleReview=stale&reviewToken=synthetic#inbound-interests");
      const recovery = page.getByRole("button", { name: "Return to portal" });
      await expect(recovery).toBeVisible();
      expect(state.gets).toContain("stale");
      await expect(page.locator(".applicant-sections .interest-detail-panel")).toHaveCount(1);
      await recovery.click();
      await expect(page).not.toHaveURL(/femaleReview|reviewToken/);
      await expect(recovery).toHaveCount(0);
      expect(state.writes).toEqual([]);
    });
    test("expired list entry does not suppress authoritative recovery", async ({ page }) => {
      const state = await fixture(page, { expired: true, error: 410 });
      await page.goto("/me?femaleReview=workflow#outbound-interests");
      await expect(page.getByRole("button", { name: "Return to portal" })).toBeVisible();
      expect(state.gets).toContain("workflow");
    });
    test("before share ordinary directional cards and withdrawal remain independent", async ({ page }) => {
      await fixture(page, { empty: true });
      await page.goto("/me#outbound-interests");
      await expect(page.locator('#outbound-interests button[data-interest-id="outgoing"]')).toBeVisible();
      await expect(page.locator('#private-documented-interests button[data-interest-id="private"]')).toBeVisible();
      await expect(page.getByText("Your submission has been recorded.")).toHaveCount(0);
      await expect(page.locator("#outbound-interests .interest-detail-panel")).toBeVisible();
      await expect(page.locator("#outbound-interests").getByRole("button", { name: "Withdraw", exact: true })).toBeVisible();
      await expect(page.locator("#private-documented-interests").getByRole("button", { name: "Withdraw", exact: true })).toBeVisible();
    });
  });
}
