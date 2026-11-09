import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";

for (const width of [1280, 390]) {
  test(`neutral female review identity at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const state of ["awaiting_brother_review", "awaiting_sister_confirmation", "pending_admin_approval", "contacts_released"]) {
      await page.route("**/api/applicant/female-review*", route => {
        const selected = new URL(route.request().url()).searchParams.has("interestId");
        return route.fulfill({ json: selected ? {
          state, role: "brother", profile: { label: "Applicant #73", applicantNumber: 73, age: 30, education: "College", job: "Engineer", imageUrls: ["data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"], email: state === "contacts_released" ? "sister@example.com" : null, phone: state === "contacts_released" ? "5550100" : null },
        } : { page: [{ interestId: "synthetic-review", state, role: "brother" }], isDone: true, continueCursor: "" } });
      });
      await page.goto("/dashboard?femaleReview=synthetic-review");
      await expect(page.getByRole("heading", { name: "Applicant #73", exact: true })).toBeVisible();
      await expect(page.getByRole("img", { name: "Profile photo 1", exact: true })).toBeVisible();
      expect(await page.content()).not.toContain("Synthetic Sister");
      expect(await page.title()).not.toContain("Synthetic Sister");
      expect(await page.locator("body").evaluate(el => el.scrollWidth <= window.innerWidth)).toBe(true);
      if (state === "contacts_released") await expect(page.getByText("sister@example.com", { exact: true })).toBeVisible();
      else await expect(page.getByText("sister@example.com", { exact: true })).toHaveCount(0);
      await page.unroute("**/api/applicant/female-review*");
    }
  });
  test(`owner retains own name at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/**", route => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/applicant/me") return route.fulfill({ json: { applicant: { name: "Synthetic Sister", gender: "female", applicantNumber: 73, profileCompletionStatus: "completed" }, inbound: [], outbound: [], privateDocumented: [], canSubmitInterest: false, interestSubmissionLimit: 3, interestSubmissions: [] } });
      if (path === "/api/applicant/female-review") return route.fulfill({ json: { page: [], isDone: true, continueCursor: "" } });
      if (path === "/api/applicant/events") return route.fulfill({ json: { upcoming: [], history: [], eligibleInterestEvents: [] } });
      return route.fulfill({ status: 400, json: { error: "Synthetic profile not loaded" } });
    });
    await page.goto("/me");
    await expect(page.getByText("Synthetic Sister", { exact: false }).first()).toBeVisible();
  });
}

for (const width of [1280, 390]) test(`synthetic review pause/resume handlers at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  let paused = false;
  const actions: string[] = [];
  await page.route("**/api/applicant/**", route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/applicant/interests") {
      const body = route.request().postDataJSON();
      actions.push(body.action); paused = body.action === "pause_connection";
      return route.fulfill({ json: { success: true } });
    }
    return route.fulfill({ json: url.searchParams.has("interestId") ? { state: "pending_admin_approval", role: "brother", paused, matchId: "synthetic-match", profile: { label: "Applicant #73", imageUrls: [] } } : { page: [{ interestId: "synthetic-review", state: "pending_admin_approval", role: "brother", paused, matchId: "synthetic-match" }], isDone: true, continueCursor: "" } });
  });
  await page.goto("/dashboard?femaleReview=synthetic-review");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  expect(actions).toEqual(["pause_connection", "resume_connection"]);
});

for (const width of [1280, 390]) test(`general notification selects its connection and uses pause/resume at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  let paused = false;
  const actions: string[] = [];
  const connection = (id: string, number: number) => ({ interestId: id, matchId: id + "-match", paused, direction: "outbound", status: "converted_to_match", flowStatus: "awaiting_final_approvals", requesterFinalApproval: "approved", recipientFinalApproval: "approved", counterparty: { label: `Applicant #${number}`, age: 30, gender: "female", fullProfileVisible: true, imageUrls: [] } });
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/applicant/interests") { const body = route.request().postDataJSON(); actions.push(body.action); paused = body.action === "pause_connection"; return route.fulfill({ json: { success: true } }); }
    if (path === "/api/applicant/me") return route.fulfill({ json: { applicant: { name: "Synthetic Brother", status: "approved", gender: "male", applicantNumber: 1, profileCompletionStatus: "completed" }, inbound: [], outbound: [connection("first", 2), connection("target", 73)], privateDocumented: [], canSubmitInterest: false, interestSubmissionLimit: 3, interestSubmissions: [] } });
    if (path === "/api/applicant/female-review") return route.fulfill({ json: { page: [], isDone: true, continueCursor: "" } });
    if (path === "/api/applicant/events") return route.fulfill({ json: { upcoming: [], history: [], eligibleInterestEvents: [] } });
    return route.fulfill({ status: 400, json: { error: "Synthetic profile not loaded" } });
  });
  await page.goto("/me?connection=target");
  await expect(page.locator(".interest-detail-panel").getByRole("heading", { name: "Applicant #73", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  expect(actions).toEqual(["pause_connection", "resume_connection"]);
});

for (const width of [1280, 390]) test(`admin synthetic all-origin private actions and resume at ${width}px`, async ({ page, context }) => {
  await page.setViewportSize({ width, height: 900 });
  await context.addCookies([{ name: "admin_token", value: createHash("sha256").update("synthetic-ui-onlytaaruf-admin-salt").digest("hex"), url: "http://127.0.0.1:3113" }]);
  const brother = { _id: "brother", name: "Synthetic Brother", gender: "male", publicApplicantNumber: 1 };
  const sister = { _id: "sister", name: "Synthetic Sister", gender: "female", publicApplicantNumber: 73 };
  const interests = ["platform_submission", "admin_entered", "email", "whatsapp"].map((source, i) => ({ _id: "interest-" + i, _creationTime: i, fromRegistrationId: "sister", toRegistrationId: "brother", fromRegistration: sister, toRegistration: brother, source, status: "new", visibility: "internal_only", femaleWorkflow: { state: "private_documented" }, updatedAt: i, createdAt: i, match: null, event: null }));
  const match = { _id: "match", maleRegistrationId: "brother", femaleRegistrationId: "sister", maleRegistration: brother, femaleRegistration: sister, interestId: interests[0]._id, interest: interests[0], status: "paused", contactGate: "pending_admin_approval", createdAt: 1, updatedAt: 1 };
  const mutations: string[] = [];
  await page.route("**/api/admin/**", route => {
    const path = new URL(route.request().url()).pathname;
    const body = route.request().postDataJSON();
    if (path === "/api/admin/female-review") return route.fulfill({ json: { page: [], isDone: true, continueCursor: "" } });
    if (body.kind === "mutation") { mutations.push(body.name); if (body.name === "matches.resume") match.status = "reviewing"; return route.fulfill({ json: { result: body.args.id } }); }
    const result = body.name === "registrations.getAll" ? [brother, sister] : body.name === "interests.getAll" ? interests : body.name === "matches.getAll" ? [match] : [];
    return route.fulfill({ json: { result } });
  });
  await page.goto("/admin/interests");
  await expect(page.getByRole("button", { name: "Share requester profile", exact: true })).toHaveCount(4);
  await expect(page.getByRole("button", { name: "Close interest", exact: true })).toHaveCount(4);
  await expect(page.getByRole("button", { name: "Decline interest", exact: true })).toHaveCount(4);
  await expect(page.getByRole("link", { name: /Synthetic Sister/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Released / closed history", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Close interest", exact: true }).first().click();
  await expect.poll(() => mutations).toContain("interests.updateStatus");
  await page.goto("/admin/pipeline");
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(page.getByRole("button", { name: "Share contacts", exact: true })).toBeVisible();
  await expect.poll(() => mutations).toContain("matches.resume");
});
