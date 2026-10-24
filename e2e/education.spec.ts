import { test, expect } from "@playwright/test";
import { educationOptions } from "../src/lib/education";
for (const path of ["/me", "/profile/synthetic"]) test("education and ethnicity save/reload in " + path, async ({ page }) => {
  let posts = 0;
  let profile = { name: "Synthetic Applicant", gender: "female", email: "synthetic@example.invalid", education: "Legacy degree", ethnicity: "Arab", prayerCommitment: "always_five", hijabResponse: "yes", spouseRequirement1: "Kind", spouseRequirement2: "Patient", spouseRequirement3: "Practicing", shareableBio: "Synthetic bio", photoSharingPermission: "ask_me_first", imageStorageIds: ["synthetic-image"], images: [{ storageId: "synthetic-image", url: "/favicon.ico" }], imageUrls: ["/favicon.ico"], interestSubmissionNumbers: [], profileCompletionStatus: "completed" };
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url()).pathname;
    if (url === "/api/applicant/profile" || url === "/api/profile/synthetic") {
      if (route.request().method() === "POST") { posts++; profile = { ...profile, ...route.request().postDataJSON() }; return route.fulfill({ json: { success: true } }); }
      return route.fulfill({ json: { registration: profile } });
    }
    if (url === "/api/applicant/me") return route.fulfill({ json: { applicant: { name: profile.name, gender: "female", applicantNumber: 1, profileCompletionStatus: "completed" }, inbound: [], outbound: [], privateDocumented: [], canSubmitInterest: false, interestSubmissionLimit: 3, interestSubmissions: [] } });
    return route.fulfill({ json: { upcoming: [], history: [], eligibleInterestEvents: [] } });
  });
  await page.goto(path);
  const education = page.getByLabel("Education level");
  await expect(education).toHaveValue("Legacy degree");
  for (const { value, label } of educationOptions) await expect(education.locator('option[value="' + value + '"]')).toHaveText(label);
  for (const value of ["associate", "trade_school", "other", "md_do", "jd", "md_phd", "jd_phd"]) {
    await education.selectOption(value);
    await page.getByLabel("Ethnicity", { exact: false }).fill("Somali");
    await page.getByRole("button", { name: /Save Profile/i }).click();
    await expect.poll(() => profile.education).toBe(value);
    await page.reload();
    await expect(education).toHaveValue(value);
    await expect(page.getByLabel("Ethnicity", { exact: false })).toHaveValue("Somali");
  }
  expect(posts).toBe(7);
});
test("signup offers every supported education option", async ({ page }) => {
  await page.route("**/api/**", route => route.fulfill({ json: {} }));
  await page.goto("/register");
  const education = page.getByLabel("Education level");
  for (const { value, label } of educationOptions) {
    await expect(education.locator('option[value="' + value + '"]')).toHaveText(label);
    await education.selectOption(value);
    await expect(education).toHaveValue(value);
  }
});
