import { test, expect } from "@playwright/test";
const confirmation = "Your interest has been submitted for admin review. An admin will review it before sharing it with the brother.";
for (const width of [1440, 390, 320]) {
  for (const scenario of ["female", "male", "male-message", "other", "other-message", "female-error", "male-error", "female-conflict"]) {
    test(scenario + " at " + width + "px", async ({ page }, info) => {
      await page.setViewportSize({ width, height: 1000 });
      const other = scenario.startsWith("other");
      const gender = scenario.startsWith("male") ? "male" : "female";
      const failed = scenario.endsWith("error") || scenario.endsWith("conflict");
      const posts: unknown[] = [];
      const interest = { interestId: "synthetic-interest", direction: "outbound", status: "new", flowStatus: "awaiting_inbound_response", counterparty: { label: "Synthetic Brother", gender: "male", age: 30, applicantNumber: 999, fullProfileVisible: false, imageUrls: [] } };
      await page.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (url.hostname !== "127.0.0.1") return route.abort();
        if (!url.pathname.startsWith("/api/")) return route.continue();
        if (url.pathname === "/api/applicant/interests") {
          posts.push(route.request().postDataJSON());
          return route.fulfill({ status: failed ? (scenario.endsWith("conflict") ? 409 : 400) : 200, json: failed ? { error: "Synthetic submission rejected" } : scenario.endsWith("message") ? { success: true, message: "Server-provided outcome." } : { success: true } });
        }
        if (url.pathname === "/api/applicant/me") return route.fulfill({ json: { applicant: { name: "Synthetic Participant", gender, applicantNumber: 1, profileCompletionStatus: "completed" }, inbound: [], outbound: other ? [interest] : [], privateDocumented: [], canSubmitInterest: true, interestSubmissionEventId: "synthetic-event", interestSubmissions: [] } });
        if (url.pathname === "/api/applicant/interest-eligibility") return route.fulfill({ json: { canSubmitInterest: true, interestSubmissionEventId: "synthetic-event", interestSubmissions: [] } });
        if (url.pathname === "/api/applicant/events") return route.fulfill({ json: { upcoming: [], history: [] } });
        return route.fulfill({ status: 400, json: { error: "Synthetic fixture only" } });
      });
      await page.goto("/me");
      const status = page.locator('[role="status"][aria-atomic="true"]');
      await expect(status).toBeAttached();
      await expect(status).toHaveAttribute("aria-live", "polite");
      if (other) {
        page.on("dialog", dialog => dialog.accept());
        await page.getByRole("button", { name: "Withdraw", exact: true }).click();
      } else {
        const form = page.getByRole("form", { name: "Interest 1", exact: true });
        await form.locator('input[type="number"]').fill("999");
        await form.locator('input[maxlength="200"]').fill("Fixture");
        await form.getByRole("button", { name: "Submit interest", exact: true }).click();
      }
      await expect.poll(() => posts.length).toBe(1);
      expect(posts[0]).toEqual(other ? { action: "withdraw", interestId: "synthetic-interest" } : { action: "submit_number", expectedEventId: "synthetic-event", applicantNumber: 999, applicantName: "Fixture" });
      if (failed) {
        await expect(page.locator(".notice.error").filter({ hasText: "Synthetic submission rejected" })).toBeVisible();
        await expect(status).toBeEmpty();
        await expect(page.getByText(confirmation, { exact: true })).toHaveCount(0);
      } else {
        await expect(status).toHaveText(scenario === "female" ? confirmation : scenario.endsWith("message") ? "Server-provided outcome." : "Updated.");
        await expect(status.locator(".notice.success")).toBeVisible();
        expect(await status.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
        expect(await page.locator("body").evaluate(el => el.scrollWidth <= window.innerWidth)).toBe(true);
        if (scenario === "female") {
          await status.scrollIntoViewIfNeeded();
          await page.screenshot({ path: info.outputPath("confirmation.png") });
        }
      }
    });
  }
}
