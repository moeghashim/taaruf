import { test, expect } from "@playwright/test";

// Real /me rendering with synthetic authenticated responses, never a real backend.
const statuses = ["waitlisted", "pending", "approved", "rejected", "withdrawn"];
const confirmations = ["confirmed", "not_confirmed", "cancelled"];
for (const width of [1440, 390]) {
  test("all registration/confirmation combinations and confirmation actions at " + width, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const now = Date.now();
    const rows = statuses.flatMap(registrationStatus => confirmations.flatMap(confirmationStatus => ["unrequested", "requested", "expired"].map(window => ({
      _id: [registrationStatus, confirmationStatus, window].join("-"),
      registrationStatus, confirmationStatus,
      ...(window === "unrequested" ? {} : { confirmationRequestedAt: now - 2000, confirmationExpiresAt: now + (window === "expired" ? -1000 : 86400000) }),
    }))));
    let posts = 0;
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.hostname !== "127.0.0.1") return route.abort();
      if (!url.pathname.startsWith("/api/")) return route.continue();
      if (url.pathname === "/api/applicant/me") return route.fulfill({ json: { applicant: { name: "Synthetic Participant", gender: "male", applicantNumber: 1, profileCompletionStatus: "completed" }, inbound: [], outbound: [], privateDocumented: [], canSubmitInterest: false, interestSubmissions: [] } });
      if (url.pathname === "/api/applicant/events") {
        if (route.request().method() === "POST") {
          const body = route.request().postDataJSON();
          expect(body.action).toBe("confirm");
          const row = rows.find(row => row._id === body.eventRegistrationId)!;
          expect(row).toBeDefined();
          row.confirmationStatus = "confirmed";
          posts++;
          return route.fulfill({ json: { success: true } });
        }
        return route.fulfill({ json: { upcoming: rows.map(row => ({ _id: row._id, title: "Synthetic " + row._id, location: "Fixture only", startsAt: now + 86400000, registration: row })), history: statuses.map(status => ({ _id: status, registrationStatus: status, attendanceStatus: "not_checked_in", event: { title: "History " + status, location: "Fixture only", startsAt: now - 86400000 } })), eligibleInterestEvents: [] } });
      }
      return route.fulfill({ status: 400, json: { error: "Synthetic fixture only" } });
    });
    await page.goto("/me");
    const events = page.locator("#events");
    await expect(events.locator(".interest-row")).toHaveCount(50);
    for (const row of rows) {
      const rendered = events.locator(".interest-row").filter({ has: page.getByRole("heading", { name: "Synthetic " + row._id, exact: true }) });
      const label = row.registrationStatus[0].toUpperCase() + row.registrationStatus.slice(1);
      await expect(rendered.locator(".pill")).toHaveText([label]);
      const canConfirm = row.confirmationStatus === "not_confirmed" && !row._id.endsWith("-expired") && (["pending", "approved"].includes(row.registrationStatus) || (row.registrationStatus === "waitlisted" && row._id.endsWith("-requested")));
      await expect(rendered.getByRole("button", { name: "Confirm", exact: true })).toHaveCount(canConfirm ? 1 : 0);
    }
    await events.screenshot({ path: testInfo.outputPath("events-" + width + ".png") });
    // Exercise every eligible synthetic row through the original handler and refresh.
    const buttons = events.getByRole("button", { name: "Confirm", exact: true });
    while (await buttons.count()) {
      const title = await buttons.first().locator("../..").locator("h4").innerText();
      const row = events.locator(".interest-row").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
      await buttons.first().click();
      await expect(row.getByRole("button")).toHaveCount(0);
      await expect(row.locator(".pill")).toHaveCount(1);
    }
    expect(posts).toBe(5);
    await expect(page.getByText("Your response has been recorded. Check your event registration status below; confirmation does not grant approval.", { exact: true })).toBeVisible();
    for (const status of statuses) {
      const row = events.locator(".interest-row").filter({ has: page.getByRole("heading", { name: "History " + status, exact: true }) });
      await expect(row.locator(".pill")).toHaveText([status[0].toUpperCase() + status.slice(1), "Not Checked In"]);
    }
  });
}
