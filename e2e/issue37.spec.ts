import { test, expect } from "@playwright/test";
for (const gender of ["male", "female"]) test("three slots and check-in states for " + gender, async ({ page }) => {
  let checked = false, approved = false, count = 0, posts = 0;
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = {};
    if (path === "/api/applicant/me") body = {
      applicant: { name: "Synthetic Applicant", gender, applicantNumber: 1, profileCompletionStatus: "completed" },
      inbound: [], outbound: [], privateDocumented: [], canSubmitInterest: checked && approved,
      interestSubmissionLimit: 3, interestSubmissionEventId: checked ? "synthetic" : null,
      interestSubmissions: Array.from({ length: count }, (_, i) => ({ interestId: String(i), status: "new" })),
    };
    if (path === "/api/applicant/events") body = { upcoming: [], history: [], eligibleInterestEvents: [] };
    if (path === "/api/applicant/interests") { posts++; count++; body = { success: true }; }
    if (path === "/api/applicant/profile") return route.fulfill({ status: 400, json: { error: "Synthetic profile not loaded" } });
    return route.fulfill({ json: body });
  });
  await page.goto("/me");
  const card = page.locator(".interest-submit-panel");
  await expect(card).toContainText("You'll be able to submit interests after attending our next event.");
  await expect(card.locator("input")).toHaveCount(0);
  await expect(card).not.toContainText("Maximum 3");
  for (const state of [{ approved: true, checked: false }, { approved: false, checked: true }]) {
    approved = state.approved; checked = state.checked;
    await page.reload();
    await expect(card.locator("input")).toHaveCount(0);
    await expect(card).toContainText("after attending our next event");
  }
  approved = true; checked = true;
  await page.reload();
  await expect(card).toContainText("Enter the applicant's number and first name. Maximum 3 interests per event.");
  await expect(card).not.toContainText("after attending");
  await expect(card.locator("form")).toHaveCount(3);
  await expect(card.locator("input")).toHaveCount(6);
  await expect(card.locator("button")).toHaveCount(3);
  const form = card.locator("form").first();
  await form.getByLabel("Applicant #", { exact: false }).fill("2");
  await form.getByLabel("First name").fill("Synthetic");
  await form.getByRole("button").click();
  await expect(card.getByRole("button", { name: "Submitted", exact: true })).toHaveCount(1);
  expect(posts).toBe(1);
  await expect(card.locator("input")).toHaveCount(6);
  count = 3;
  await page.reload();
  await expect(card.locator("button:disabled")).toHaveCount(3);
  await expect(card.locator("input:disabled")).toHaveCount(6);
  const styles = await card.evaluate(el => {
    const heading = el.querySelector("h3")!.getBoundingClientRect();
    const input = el.querySelector("input")!.getBoundingClientRect();
    const inputs = el.querySelectorAll("input");
    return { aligned: Math.abs(heading.left - input.left) < 1, height: input.height, sameLine: inputs[0].getBoundingClientRect().top === inputs[1].getBoundingClientRect().top, size: getComputedStyle(el.querySelector("p")!).fontSize };
  });
  expect(styles).toEqual({ aligned: true, height: 40, sameLine: true, size: "12px" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await card.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  checked = false; // Revoked check-in / latest-event rollover.
  await page.reload();
  await expect(card.locator("input")).toHaveCount(0);
  await expect(card).toContainText("after attending our next event");
});
