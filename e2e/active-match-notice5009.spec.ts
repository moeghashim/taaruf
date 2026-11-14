import { test, expect } from "@playwright/test";
import { ACTIVE_MATCH_CONFLICT_MESSAGE } from "../src/lib/applicant-match-conflict";

for (const role of ["brother", "sister"]) test(role + " retains review on active-match conflict and explicitly retries", async ({ page }) => {
  let blocked = true;
  let approved = false;
  let writes = 0;
  await page.route("**/api/applicant/female-review**", async route => {
    const request = route.request();
    if (request.method() === "POST") {
      writes++;
      if (blocked) return route.fulfill({ status: 409, json: { error: ACTIVE_MATCH_CONFLICT_MESSAGE } });
      approved = true;
      return route.fulfill({ json: { success: true } });
    }
    const row = { interestId: "synthetic", role, mutualInterest: true, state: "in_review", ownAction: approved ? null : "review", ownActionStage: approved ? null : "final", ownDecision: approved ? "approved" : "pending", canView: true };
    return route.fulfill({ json: new URL(request.url()).searchParams.has("interestId") ? { ...row, profile: { label: "Synthetic review", shareableBio: "Authorized synthetic bio" } } : { page: [row], isDone: true, continueCursor: "" } });
  });
  await page.goto("/dashboard?femaleReview=synthetic");
  const approve = page.getByRole("button", { name: "Approve", exact: true });
  await approve.click();
  await expect(page.locator("#review-notifications").getByRole("alert")).toHaveText(ACTIVE_MATCH_CONFLICT_MESSAGE);
  await expect(page.getByText("Authorized synthetic bio", { exact: true })).toBeVisible();
  await expect(approve).toBeEnabled();
  await expect(page.getByRole("button", { name: "Retry loading review", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Return to portal", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toHaveCount(0);
  expect(writes).toBe(1);
  blocked = false;
  await approve.click();
  await expect(page.getByRole("status").filter({ hasText: "Your decision is recorded" })).toBeVisible();
  await expect(page.locator("#review-notifications").getByRole("alert")).toHaveCount(0);
  expect(writes).toBe(2);
});
