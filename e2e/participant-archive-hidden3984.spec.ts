import { test, expect } from "@playwright/test";
test.use({ channel: "chrome", serviceWorkers: "block" });
const origin = process.env.PORTAL_BASE || "http://127.0.0.1:3984";
// Synthetic visibility only. Every API intercepted; all writes/external traffic blocked.
for (const gender of ["male", "female"]) for (const width of [1440, 390, 320]) for (const archived of [false, true]) test(
  "participant archive hidden " + gender + " " + width + " archived=" + archived, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  let writes = 0;
  await page.routeWebSocket("**/*", socket => socket.close());
  await page.route("**/*", route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (req.method() !== "GET") { writes++; return route.abort(); }
    const registration = { name: "Synthetic", gender, archivedAt: archived ? 100 : null, imageStorageIds: [], imageUrls: [], interestSubmissionNumbers: [] };
    if (url.pathname === "/api/applicant/me") return route.fulfill({ json: { applicant: { ...registration, status: "approved", applicantNumber: 999, profileCompletionStatus: "completed" }, inbound: [], outbound: [], privateDocumented: [], canSubmitInterest: false, interestSubmissions: [] } });
    if (url.pathname === "/api/applicant/profile") return route.fulfill({ json: { registration } });
    if (url.pathname === "/api/applicant/events") return route.fulfill({ json: { upcoming: [{ _id: "synthetic-event", title: "Synthetic future event", startsAt: Date.now() + 86400000, location: "Fixture only", canWithdraw: !archived, registration: { _id: "synthetic-row", registrationStatus: archived ? "withdrawn" : "approved", confirmationStatus: archived ? "cancelled" : "confirmed" } }], history: [], eligibleInterestEvents: [] } });
    if (url.pathname === "/api/applicant/matchmaker") return route.fulfill({ json: { matches: [], optedIn: false } });
    if (url.pathname === "/api/applicant/female-review") return route.fulfill({ json: { page: [], isDone: true, continueCursor: "" } });
    return route.fulfill({ json: { canSubmitInterest: false } });
  });
  await page.goto(origin + "/me");
  await expect(page.getByText("Synthetic future event", { exact: true })).toBeVisible();
  for (const hash of ["#overview", "#events", "#applicant-interests", "#inbound-interests", "#outbound-interests", "#private-documented-interests", "#profile", "#matchmaker-matching"]) {
    await page.evaluate(hash => { window.location.hash = hash; }, hash);
    await expect(page.getByRole("region", { name: "Participant archive", includeHidden: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Archive participant|Restore availability|Confirm archive|Confirm restore availability/, includeHidden: true })).toHaveCount(0);
    await expect(page.getByRole("dialog", { includeHidden: true })).toHaveCount(0);
    if (hash === "#overview" || hash === "#events") {
      const withdraw = page.locator("#events").getByRole("button", { name: "Withdraw", exact: true });
      await expect(withdraw).toHaveCount(archived ? 0 : 1);
      if (!archived) { page.once("dialog", dialog => dialog.dismiss()); await withdraw.click(); }
    }
    if (hash === "#profile" && archived) await expect(page.getByText("Archived profile details are read-only.")).toBeVisible();
    if (hash === "#matchmaker-matching") {
      const consent = page.getByRole("checkbox", { name: "I would like to be considered for background matchmaking." });
      await expect(consent).toBeVisible();
      if (archived) { await expect(consent).toBeDisabled(); await expect(page.getByText(/Your profile is archived/)).toBeVisible(); }
      else await expect(consent).toBeEnabled();
    }
    await page.screenshot({ path: info.outputPath(hash.slice(1) + ".png"), fullPage: true });
  }
  expect(writes).toBe(0);
});
