import { expect, test } from "@playwright/test";
for (const role of ["brother", "sister"]) for (const width of [1280, 390, 320]) test(role + " authorized contacts " + width, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 950 });
  let state = "contacts_released", detailState = state, permitted = true, paused = false, denied = false;
  let count = 1; let done = false;
  const writes: string[] = [];
  await page.routeWebSocket("**/*", ws => ws.close());
  await page.route("**/*", route => {
    const u = new URL(route.request().url());
    if (u.origin !== new URL(process.env.PREVIEW_URL || "http://127.0.0.1:3218").origin) return route.abort();
    if (!u.pathname.startsWith("/api/")) return route.continue();
    if (route.request().method() !== "GET") { writes.push(u.pathname); return route.fulfill({ status: 403, json: {} }); }
    if (u.pathname === "/api/applicant/me") return route.fulfill({ json: { applicant: { name: "Synthetic Applicant", gender: role === "brother" ? "male" : "female", status: "approved", applicantNumber: 999, profileCompletionStatus: "completed" }, inbound: [], outbound: [], privateDocumented: [], canSubmitInterest: false, interestSubmissionLimit: 3, interestSubmissions: [] } });
    if (u.pathname === "/api/applicant/events") return route.fulfill({ json: { upcoming: [], history: [], eligibleInterestEvents: [] } });
    if (u.pathname === "/api/applicant/female-review") {
      if (u.searchParams.has("interestId")) return route.fulfill({ status: denied ? 409 : 200, json: denied ? { error: "Review unavailable." } : { role, state: detailState, paused, profile: { label: "Synthetic match", age: 30, email: permitted ? "synthetic@example.invalid" : null, phone: null, imageUrls: [] } } });
      return route.fulfill({ json: { page: Array.from({ length: count }, (_, i) => ({ interestId: "synthetic-" + i, state, role, paused, reviewExpiresAt: 1 })), isDone: done, continueCursor: "next" } });
    }
    return route.fulfill({ status: 400, json: {} });
  });
  const banner = page.locator(".contacts-ready");
  await page.goto("/me#applicant-interests");
  await expect(banner.getByRole("heading")).toHaveText("Contacts are ready");
  await expect(banner).toContainText("the team has approved sharing contact details");
  const cta = banner.getByRole("link", { name: "View contact details", exact: true });
  await expect(cta).toHaveAttribute("href", "/dashboard?femaleReview=synthetic-0#contact-details");
  expect((await cta.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  expect(await page.locator("body").evaluate(el => el.scrollWidth <= innerWidth)).toBe(true);
  await cta.focus(); await expect(cta).toBeFocused();
  await banner.screenshot({ path: info.outputPath("notice.png") });
  await cta.click();
  const contacts = page.getByRole("region", { name: "Contact details", exact: true });
  await expect(contacts).toBeVisible(); await expect(contacts).toBeFocused();
  await expect(contacts).toContainText("synthetic@example.invalid");
  await contacts.screenshot({ path: info.outputPath("contacts.png") });
  done = true; await page.getByRole("button", { name: "Load more reviews", exact: true }).click();
  await expect(contacts).toBeVisible();
  permitted = false;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(contacts).toHaveCount(0);
  await page.goto("/me#applicant-interests"); await expect(page.locator("#review-notifications")).toBeVisible(); await expect(banner).toHaveCount(0);
  permitted = true; denied = true; await page.reload(); await expect(banner).toHaveCount(0);
  denied = false; paused = true; await page.reload(); await expect(banner).toHaveCount(0);
  paused = false;
  for (const unavailable of ["pending_admin_approval", "awaiting_sister_confirmation", "revoked", "closed"]) {
    detailState = unavailable; await page.reload(); await expect(page.locator("#review-notifications")).toBeVisible(); await expect(banner).toHaveCount(0);
  }
  detailState = state; count = 2; await page.reload(); await expect(banner.getByRole("link")).toHaveCount(2);
  await expect(banner.getByRole("link", { name: "View contact details for connection 2" })).toHaveAttribute("href", "/dashboard?femaleReview=synthetic-1#contact-details");
  state = "pending_admin_approval"; await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await expect(banner).toHaveCount(0);
  expect(writes).toEqual([]);
});
