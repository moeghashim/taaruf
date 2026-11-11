import { test, expect } from "@playwright/test";

for (const width of [1280, 390, 320]) for (const role of ["brother", "sister"]) {
  for (const state of ["action", "waiting", "approved", "declined", "paused", "expired", "closed", "contacts", "unavailable", "unknown"]) {
    test(role + " " + state + " " + width, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      const requests: string[] = [];
      const item = (id: string) => ({ interestId: id, role, state: state === "closed" ? "closed" : ["contacts", "unavailable"].includes(state) ? "contacts_released" : state === "unknown" ? "future_state" : "in_review", ownAction: state === "action" ? "review" : null, ownDecision: state === "approved" ? "approved" : state === "declined" ? "declined" : "pending", paused: state === "paused", canPause: state === "paused", reviewExpired: state === "expired", canView: !["expired", "closed"].includes(state) });
      await page.routeWebSocket("**/*", socket => socket.close());
      await page.route("**/*", route => {
        const url = new URL(route.request().url());
        if (url.origin !== "http://127.0.0.1:3554") return route.abort();
        if (!url.pathname.startsWith("/api/")) return route.continue();
        if (url.pathname === "/api/applicant/female-review") {
          const id = url.searchParams.get("interestId");
          if (id) requests.push(id);
          return route.fulfill({ json: id ? { ...item(id), profile: { label: "Synthetic " + id, age: 30, shareableBio: "Private bio " + id, imageUrls: [], ...(state === "contacts" ? { email: id + "@example.invalid" } : {}) } } : { page: [item("first"), item("second")], isDone: true, continueCursor: "" } });
        }
        if (url.pathname === "/api/applicant/me") return route.fulfill({ json: { applicant: { name: "Synthetic", status: "approved", gender: role === "brother" ? "male" : "female", applicantNumber: 999, profileCompletionStatus: "completed" }, inbound: [], outbound: [], privateDocumented: [], canSubmitInterest: false, interestSubmissions: [] } });
        if (url.pathname === "/api/applicant/matchmaker") return route.fulfill({ json: { matches: [], optedIn: false } });
        if (url.pathname === "/api/applicant/events") return route.fulfill({ json: { upcoming: [], history: [] } });
        return route.fulfill({ json: { registration: { name: "Synthetic", gender: role === "brother" ? "male" : "female", imageUrls: [], imageStorageIds: [], interestSubmissionNumbers: [] }, canSubmitInterest: false } });
      });
      await page.goto("/me#applicant-interests");
      const notifications = page.locator("#review-notifications");
      await expect(notifications).toBeVisible();
      await expect(notifications.getByRole("heading", { name: "Profile reviews", exact: true })).toHaveCount(0);
      await expect(notifications.getByRole("button", { name: "Refresh", exact: true })).toHaveCount(0);
      await expect(notifications.getByText("Review invitations and confirmations. Only you can respond from your account.")).toHaveCount(0);
      const links = notifications.locator("a[href*='femaleReview=']");
      if (["closed", "expired"].includes(state)) {
        await expect(notifications.getByRole("heading", { name: state === "closed" ? "Connection closed" : "Review invitation expired" })).toHaveCount(2);
        await expect(links).toHaveCount(0);
      } else {
        if (state === "contacts") {
          await expect(notifications.getByRole("heading", { name: "Contacts are ready" })).toBeVisible();
          await expect(notifications.getByText("Contact sharing update", { exact: true })).toHaveCount(0);
        }
        await expect(links).toHaveCount(2);
        await expect(links.nth(1)).toHaveAttribute("href", "/dashboard?femaleReview=second" + (state === "contacts" ? "#contact-details" : ""));
        if (state === "approved" || state === "declined") await expect(notifications.getByText("Your decision: " + state + ".", { exact: true })).toHaveCount(2);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        if (state === "contacts" || state === "action") await page.screenshot({ path: info.outputPath("portal.png"), fullPage: true });
        await links.nth(1).click();
        await expect(page.getByRole("heading", { name: "Synthetic second", exact: true })).toBeVisible();
        expect(requests).toContain("second");
        await expect(page.getByText("Private bio second", { exact: true })).toBeVisible();
        if (state === "contacts") await expect(page.getByRole("region", { name: "Contact details" })).toContainText("second@example.invalid");
        else await expect(page.getByRole("region", { name: "Contact details" })).toHaveCount(0);
        if (state === "paused") await expect(page.getByRole("button", { name: "Resume", exact: true })).toBeVisible();
        if (state === "action") await expect(page.getByRole("button", { name: role === "brother" ? "Accept" : "Confirm interest", exact: true })).toBeVisible();
      }
      await expect(page.getByText(/brother accepted|brother has accepted|You both agreed|Review declined/i)).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
}

for (const width of [1280, 390, 320]) for (const gender of ["male", "female"]) test("inbound primary " + gender + " " + width, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  const row = (id: string, action: boolean, paused = false) => ({ interestId: id, direction: "inbound", status: "active", flowStatus: "awaiting_inbound_response", visibility: "visible", ownFinalApproval: "pending", canRespond: action, canFinalApprove: false, canWithdraw: false, paused, counterparty: { label: "Applicant " + id, age: 30, gender: gender === "male" ? "female" : "male", fullProfileVisible: true, imageUrls: [], shareableBio: "Bio " + id } });
  await page.routeWebSocket("**/*", socket => socket.close());
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://127.0.0.1:3554") return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/applicant/me") return route.fulfill({ json: { applicant: { name: "Synthetic", status: "approved", gender, applicantNumber: 999, profileCompletionStatus: "completed" }, inbound: [row("first", true), row("second", true), row("waiting", false), row("paused", true, true)], outbound: [], privateDocumented: [], canSubmitInterest: false, interestSubmissions: [] } });
    if (url.pathname === "/api/applicant/female-review") return route.fulfill({ json: { page: [], isDone: true, continueCursor: "" } });
    if (url.pathname === "/api/applicant/matchmaker") return route.fulfill({ json: { matches: [], optedIn: false } });
        if (url.pathname === "/api/applicant/events") return route.fulfill({ json: { upcoming: [], history: [] } });
    return route.fulfill({ json: { registration: { name: "Synthetic", gender, imageUrls: [], imageStorageIds: [], interestSubmissionNumbers: [] }, canSubmitInterest: false } });
  });
  await page.goto("/me#applicant-interests");
  const banner = page.getByRole("region", { name: "You have interests to review" });
  await expect(banner).toBeVisible();
  await expect(banner.getByRole("link")).toHaveCount(2);
  expect((await banner.boundingBox())!.y).toBeLessThan((await page.getByRole("heading", { name: "Submit Interest", exact: true }).boundingBox())!.y);
  await expect(banner).not.toContainText("new");
  await page.screenshot({ path: info.outputPath("inbound.png"), fullPage: true });
  await banner.getByRole("link", { name: "View interest 2", exact: true }).click();
  const selected = page.locator('[data-interest-id="second"]');
  await expect(selected).toHaveAttribute("aria-pressed", "true");
  await expect(selected).toBeFocused();
  await expect(selected).toBeInViewport();
  await expect(page.locator("#inbound-interests .interest-detail-panel")).toContainText("Bio second");
  await expect(page.locator("#inbound-interests").getByRole("button", { name: "Accept", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const role of ["brother", "sister"]) test("detail error retry " + role, async ({ page }) => {
  let failed = true;
  await page.route("**/api/applicant/female-review**", route => {
    const id = new URL(route.request().url()).searchParams.get("interestId");
    if (id && failed) return route.fulfill({ status: 503, json: { error: "Temporary detail failure" } });
    return route.fulfill({ json: id ? { state: "in_review", role, ownAction: "review", profile: { label: "Recovered", imageUrls: [] } } : { page: [], isDone: true, continueCursor: "" } });
  });
  await page.goto("/dashboard?femaleReview=retry");
  await expect(page.locator("#review-notifications").getByRole("alert")).toContainText("Temporary detail failure");
  failed = false;
  await page.getByRole("button", { name: "Retry loading review", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Recovered", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: role === "brother" ? "Accept" : "Confirm interest", exact: true })).toBeVisible();
});
