import { test, expect } from "@playwright/test";
for (const width of [1280, 390]) {
  test("archive confirmation keyboard/cancel and archived state at " + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    let archivedAt: number | null = null;
    let writes = 0;
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") return route.abort();
      if (!url.pathname.startsWith("/api/")) return route.continue();
      if (url.pathname === "/api/applicant/archive") {
        writes++; expect(route.request().postDataJSON()).toEqual({ expectedArchivedAt: null, confirm: true });
        archivedAt = 100; return route.fulfill({ json: { archivedAt } });
      }
      if (url.pathname === "/api/applicant/me") return route.fulfill({ json: { applicant: { name: "Synthetic", gender: "male", applicantNumber: 1, profileCompletionStatus: "completed" }, inbound: [], outbound: [], privateDocumented: [], canSubmitInterest: true, interestSubmissions: [] } });
      if (url.pathname === "/api/applicant/profile") return route.fulfill({ json: { registration: { name: "Synthetic", gender: "male", archivedAt, imageStorageIds: [], imageUrls: [], interestSubmissionNumbers: [], matchmakingPreference: "events_only" } } });
      if (url.pathname === "/api/applicant/events") return route.fulfill({ json: { upcoming: [{ _id: "synthetic", title: "Future event", startsAt: 1892537200000, location: "Test", registration: null }], history: [{ _id: "history", registrationStatus: "approved", attendanceStatus: "attended", event: { title: "Past event", startsAt: 1692537200000, location: "Test" } }] } });
      return route.fulfill({ json: {} });
    });
    await page.goto("/me");
    const trigger = page.getByRole("button", { name: "Archive participant", exact: true });
    await trigger.focus(); await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    await expect(dialog).toContainText("queued matching communications");
    await expect(dialog).toContainText("waitlist entries will be cancelled");
    await expect(dialog).toContainText("No refund is issued automatically");
    await page.screenshot({ path: "/tmp/archive-confirm-" + width + ".png" });
    await page.keyboard.press("Enter");
    await expect(dialog).not.toBeVisible(); expect(writes).toBe(0);
    await expect(trigger).toBeFocused();
    await page.keyboard.press("Enter"); await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible(); expect(writes).toBe(0);
    await trigger.click(); await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Confirm archive", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Participant archived" })).toBeVisible(); expect(writes).toBe(1);
    await expect(page.getByRole("button", { name: "Register", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Save matchmaking preference" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Submit interest", exact: true })).toHaveCount(0);
    await expect(page.getByText("Past event", { exact: true })).toBeVisible();
    await page.reload(); await expect(page.getByRole("heading", { name: "Participant archived" })).toBeVisible();
    await expect(trigger).toHaveCount(0);
  });
}
