import { expect, test } from "@playwright/test";

for (const width of [1280, 390]) {
  test(`neutral female review identity at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const state of ["awaiting_brother_review", "awaiting_sister_confirmation", "pending_admin_approval", "contacts_released"]) {
      await page.route("**/api/applicant/female-review*", route => {
        const selected = new URL(route.request().url()).searchParams.has("interestId");
        return route.fulfill({ json: selected ? {
          state, role: "brother", profile: { label: "Applicant #73", applicantNumber: 73, age: 30, education: "College", job: "Engineer", imageUrls: ["data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"], email: state === "contacts_released" ? "sister@example.com" : null, phone: state === "contacts_released" ? "5550100" : null },
        } : { page: [{ interestId: "synthetic-review", state, role: "brother" }], isDone: true, continueCursor: "" } });
      });
      await page.goto("/dashboard?femaleReview=synthetic-review");
      await expect(page.getByRole("heading", { name: "Applicant #73", exact: true })).toBeVisible();
      await expect(page.getByRole("img", { name: "Profile photo 1", exact: true })).toBeVisible();
      expect(await page.content()).not.toContain("Synthetic Sister");
      expect(await page.title()).not.toContain("Synthetic Sister");
      expect(await page.locator("body").evaluate(el => el.scrollWidth <= window.innerWidth)).toBe(true);
      if (state === "contacts_released") await expect(page.getByText("sister@example.com", { exact: true })).toBeVisible();
      else await expect(page.getByText("sister@example.com", { exact: true })).toHaveCount(0);
      await page.unroute("**/api/applicant/female-review*");
    }
  });
  test(`owner retains own name at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/**", route => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/applicant/me") return route.fulfill({ json: { applicant: { name: "Synthetic Sister", gender: "female", applicantNumber: 73, profileCompletionStatus: "completed" }, inbound: [], outbound: [], privateDocumented: [], canSubmitInterest: false, interestSubmissionLimit: 3, interestSubmissions: [] } });
      if (path === "/api/applicant/female-review") return route.fulfill({ json: { page: [], isDone: true, continueCursor: "" } });
      if (path === "/api/applicant/events") return route.fulfill({ json: { upcoming: [], history: [], eligibleInterestEvents: [] } });
      return route.fulfill({ status: 400, json: { error: "Synthetic profile not loaded" } });
    });
    await page.goto("/me");
    await expect(page.getByText("Synthetic Sister", { exact: false }).first()).toBeVisible();
  });
}
