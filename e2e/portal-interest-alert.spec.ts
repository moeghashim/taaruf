import { expect, test } from "@playwright/test";
for (const width of [1280, 390, 320]) {
  test("prominent invitation and recipient review at " + width, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    let state = "awaiting_brother_review";
    let count = 1;
    let reviewExpiresAt = Date.now() + 86400000;
    let fail = false;
    const actions: unknown[] = [];
    await page.route("**/api/**", route => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/applicant/me") return route.fulfill({ json: { applicant: { name: "Synthetic Brother", status: "approved", gender: "male", applicantNumber: 219, profileCompletionStatus: "completed" }, inbound: [], outbound: [], privateDocumented: [], canSubmitInterest: false, interestSubmissionLimit: 3, interestSubmissions: [] } });
      if (url.pathname === "/api/applicant/events") return route.fulfill({ json: { upcoming: [], history: [], eligibleInterestEvents: [] } });
      if (url.pathname === "/api/applicant/female-review") {
        if (route.request().method() === "POST") { actions.push(route.request().postDataJSON()); state = "awaiting_sister_confirmation"; return route.fulfill({ json: { success: true } }); }
        if (fail) return route.fulfill({ status: 503, json: { error: "Unable to load reviews." } });
        return route.fulfill({ json: url.searchParams.has("interestId") ? { state, role: "brother", profile: { label: "Applicant #73", age: 30, imageUrls: [], email: null, phone: null } } : { page: Array.from({ length: count }, (_, i) => ({ interestId: "synthetic-review-" + i, state, role: "brother", reviewExpiresAt })), isDone: true, continueCursor: "" } });
      }
      return route.fulfill({ status: 400, json: { error: "Synthetic profile not loaded" } });
    });
    await page.goto("/me");
    const banner = page.getByRole("region", { name: "A sister is interested in you", exact: true });
    await expect(banner).toBeVisible();
    const cta = banner.getByRole("link", { name: "Review profile", exact: true });
    const box = await cta.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(48);
    expect(box!.y + box!.height).toBeLessThan(900);
    await expect(banner).toContainText("Accepting does not share contact details");
    expect(await page.locator("body").evaluate(el => el.scrollWidth <= window.innerWidth)).toBe(true);
    await cta.focus(); await expect(cta).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath("portal-" + width + ".png"), fullPage: true });
    await cta.click();
    await expect(page.getByRole("heading", { name: "Applicant #73", exact: true })).toBeVisible();
    expect(actions).toHaveLength(0);
    await page.getByRole("button", { name: "Accept", exact: true }).click();
    await expect(page.getByRole("button", { name: "Accept", exact: true })).toHaveCount(0);
    expect(actions).toEqual([{ action: "respond", interestId: "synthetic-review-0", decision: "accept" }]);
    await page.goto("/me"); await expect(banner).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Waiting for confirmation", exact: true })).toBeVisible();
    state = "awaiting_brother_review"; count = 2;
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(banner.getByRole("link")).toHaveCount(2);
    await expect(banner.getByRole("link", { name: "Review profile for invitation 2" })).toHaveAttribute("href", "/dashboard?femaleReview=synthetic-review-1");
    for (const resolved of ["revoked", "declined", "closed"]) {
      state = resolved; await page.getByRole("button", { name: "Refresh", exact: true }).click();
      await expect(banner).toHaveCount(0);
      await expect(page.getByRole("region", { name: "Profile reviews", exact: true }).getByRole("link")).toHaveCount(0);
    }
    state = "awaiting_brother_review"; count = 1; reviewExpiresAt = Date.now() - 1;
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(banner).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Review invitation expired" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Profile reviews", exact: true }).getByRole("link")).toHaveCount(0);
    count = 0; await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(page.getByText("No profile reviews right now.")).toBeVisible();
    fail = true; await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Unable to load reviews." })).toBeVisible();
  });
}
