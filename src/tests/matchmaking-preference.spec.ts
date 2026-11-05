import { test, expect } from "@playwright/test";

for (const width of [1280, 390]) {
  test("explicit registration radios, keyboard and no default at " + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/**", route => route.abort());
    await page.goto("http://localhost:3049/register");
    const choices = page.getByRole("group", { name: "Matchmaking preference" });
    await expect(choices.getByRole("radio")).toHaveCount(2);
    await expect(choices.locator("input:checked")).toHaveCount(0);
    expect(await choices.locator("input").first().evaluate((el: HTMLInputElement) => el.required && !el.validity.valid)).toBe(true);
    await choices.getByRole("radio").first().focus();
    await page.keyboard.press("Space");
    await expect(choices.getByRole("radio").first()).toBeChecked();
    await page.keyboard.press("ArrowDown");
    await expect(choices.getByRole("radio").last()).toBeChecked();
    await expect(choices.locator("input:checked")).toHaveCount(1);
    expect(await choices.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await choices.screenshot({ path: "artifacts/matchmaking-registration-" + width + ".png" });
  });

  test("own preference saved state, withdrawal, re-opt-in and conflict at " + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    let preference: string | null = null;
    let revision: number | null = null;
    let conflict = false;
    const writes: unknown[] = [];
    await page.route("**/api/**", async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/applicant/me") return route.fulfill({ json: { applicant: { name: "Synthetic Applicant", gender: "female", applicantNumber: 1, profileCompletionStatus: "completed" }, inbound: [], outbound: [], privateDocumented: [], canSubmitInterest: false, interestSubmissionLimit: 3, interestSubmissionEventId: null, interestSubmissions: [] } });
      if (path === "/api/applicant/events") return route.fulfill({ json: { upcoming: [], history: [] } });
      if (path === "/api/applicant/profile") return route.fulfill({ json: { registration: { name: "Synthetic Applicant", gender: "female", email: "synthetic@example.invalid", ethnicity: "", imageStorageIds: [], imageUrls: [], prayerCommitment: "", hijabResponse: "", spouseRequirement1: "", spouseRequirement2: "", spouseRequirement3: "", shareableBio: "", photoSharingPermission: "ask_me_first", interestSubmission: "", interestSubmissionNumbers: [], applicantNotesToAdmin: "", matchmakingPreference: preference, matchmakingPreferenceUpdatedAt: revision } } });
      if (path === "/api/applicant/matchmaking-preference") {
        const body = route.request().postDataJSON(); writes.push(body);
        if (conflict) return route.fulfill({ status: 409, json: { error: "Conflict" } });
        expect(body.expectedUpdatedAt).toBe(revision);
        preference = body.matchmakingPreference; revision = (revision ?? 0) + 1;
        return route.fulfill({ json: { matchmakingPreference: preference, matchmakingPreferenceUpdatedAt: revision } });
      }
      return route.abort();
    });
    await page.goto("http://localhost:3049/me");
    const control = page.locator("#matchmaking-preference");
    await expect(control).toContainText("Not recorded — no consent");
    await expect(control.locator("input:checked")).toHaveCount(0);
    for (const index of [1, 0, 1]) {
      await control.getByRole("radio").nth(index).check();
      await control.getByRole("button", { name: "Save matchmaking preference" }).click();
      await expect(control.getByRole("status")).toHaveText("Matchmaking preference saved.");
    }
    expect(writes).toHaveLength(3);
    conflict = true;
    await control.getByRole("radio").first().check();
    await control.getByRole("button", { name: "Save matchmaking preference" }).click();
    await expect(control.getByRole("alert")).toContainText("Nothing was overwritten");
    await expect(control).toContainText("Saved preference: Opted in");
    await control.getByRole("button", { name: "Reload saved preference" }).click();
    await expect(control.getByRole("radio").last()).toBeChecked();
    await expect(control.getByRole("button", { name: "Save matchmaking preference" })).toBeDisabled();
    expect(await control.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await control.screenshot({ path: "artifacts/matchmaking-portal-" + width + ".png" });
  });
}
