import { test, expect } from "@playwright/test";
const origin = process.env.CONTACT_TEST_ORIGIN || "http://127.0.0.1:4433";
const brother = "The sister’s contact details are below. Make your intention, reach out with a respectful introduction, and may Allah put khayr in it.";
const sister = "The brother’s contact details are below. Please expect him to reach out to you with a respectful introduction. May Allah put khayr in it.";
// All API traffic is synthetic. Non-GET and off-origin requests fail closed.
for (const gender of ["male", "female"]) for (const path of ["ordinary", "inline", "standalone", "matchmaker"]) for (const width of [390, 1280]) {
  test(gender + " " + path + " " + width + " released and private states", async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    let released = true;
    let state = "contacts_released";
    let paused = false;
    const writes: string[] = [];
    const profile = () => ({ name: "Synthetic Contact", label: "Synthetic Contact", gender: gender === "male" ? "female" : "male", age: 30, imageUrls: [], images: [], shareableBio: "Synthetic profile for copy review only.", email: released ? "synthetic@example.test" : null, phone: released ? "+1 202 555 0100" : null });
    const review = () => ({ interestId: "copy4433", state, role: gender === "male" ? "brother" : "sister", paused, ownDecision: "approved", ownAction: null, canView: !["closed", "revoked", "expired"].includes(state), profile: profile() });
    await page.routeWebSocket("**/*", socket => socket.close());
    await page.route("**/*", route => {
      const req = route.request(); const url = new URL(req.url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith("/api/")) return route.continue();
      if (req.method() !== "GET") { writes.push(url.pathname); return route.abort(); }
      const p = profile();
      const interest = { interestId: "copy4433", femaleWorkflow: false, direction: gender === "male" ? "outbound" : "inbound", status: released ? "in_progress" : state, flowStatus: released ? "contact_shared" : state, visibility: "visible", paused, canRespond: false, canFinalApprove: false, canWithdraw: false, ownFinalApproval: "approved", contactSharedAt: released ? 123456 : null, counterparty: { ...p, fullProfileVisible: true } };
      let json: unknown = {};
      if (url.pathname === "/api/applicant/me") json = { applicant: { name: "Synthetic Applicant", gender, status: "approved", applicantNumber: 999, profileCompletionStatus: "completed" }, inbound: path === "ordinary" && gender === "female" ? [interest] : [], outbound: path === "ordinary" && gender === "male" ? [interest] : [], privateDocumented: [], canSubmitInterest: false, interestSubmissionLimit: 3, interestSubmissions: [] };
      else if (url.pathname === "/api/applicant/female-review") json = url.searchParams.has("interestId") ? review() : { page: ["inline", "standalone"].includes(path) ? [review()] : [], isDone: true, continueCursor: "" };
      else if (url.pathname === "/api/applicant/profile") json = { registration: { name: "Synthetic Applicant", gender, imageUrls: [], imageStorageIds: [], interestSubmissionNumbers: [] } };
      else if (url.pathname === "/api/applicant/matchmaker") json = { optedIn: true, matches: path === "matchmaker" ? [{ _id: "copy4433", status: released ? "contact_shared" : state, presentedAt: 123456, contactShared: released, myApproval: true, canApprove: false, canWithdraw: false, partner: p }] : [] };
      else if (url.pathname === "/api/applicant/events") json = { upcoming: [], history: [], eligibleInterestEvents: [] };
      else if (url.pathname === "/api/applicant/interest-eligibility") json = { canSubmitInterest: false };
      else return route.fulfill({ status: 404, json: { error: "Unmocked API blocked" } });
      return route.fulfill({ json, headers: { "cache-control": "no-store" } });
    });
    const url = path === "standalone" ? "/dashboard?femaleReview=copy4433" : path === "inline" ? "/me?femaleReview=copy4433#applicant-interests" : path === "ordinary" ? "/me?connection=copy4433#applicant-interests" : "/me#matchmaker-matching";
    await page.goto(url);
    const copy = page.getByText(gender === "male" ? brother : sister, { exact: true });
    await expect(copy).toBeVisible();
    await expect(page.getByRole("heading", { name: "Contact details", exact: true })).toBeVisible();
    await expect(page.getByText("synthetic@example.test", { exact: false })).toBeVisible();
    if (gender === "male") { await expect(page.locator("strong").filter({ hasText: "Bismillah — reach out today!" })).toBeVisible(); }
    else await expect(page.getByText("Bismillah — reach out today!")).toHaveCount(0);
    await copy.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: (process.env.CONTACT_SCREENSHOTS || "/Users/moeghashim/taaruf/privateops/contact4433") + "/" + path + "-" + gender + "-" + width + ".png" });
    // Existing backend projections redact contacts on pending, closed and revoked states.
    for (const privateState of ["in_review", "closed", "revoked", "expired"]) {
      released = false; state = privateState;
      await page.reload();
      await expect(page.locator("h1")).toBeVisible();
      if (["inline", "standalone"].includes(path)) await expect(page.getByRole("region", { name: "Selected profile review" })).toBeVisible();
      await expect(copy).toHaveCount(0);
      await expect(page.getByText("synthetic@example.test")).toHaveCount(0);
      await expect(page.getByText("Bismillah — reach out today!")).toHaveCount(0);
    }
    if (["inline", "standalone"].includes(path)) {
      released = true; state = "contacts_released"; paused = true;
      await page.reload(); await expect(copy).toHaveCount(0);
    }
    expect(writes).toEqual([]);
  });
}
