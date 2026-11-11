import { expect, test, type Page } from "@playwright/test";

// Production Next renderer, synthetic authorized GETs only. Run with
// playwright.ribbon3554.config.ts; never contact auth/Convex or mutate real data.
const origin = "http://127.0.0.1:3660";
test.use({ baseURL: origin, serviceWorkers: "block" });
type Role = "brother" | "sister";
const views = ["#overview", "#applicant-interests", "#profile", "#matchmaker-matching"];
const now = Date.now();
const interest = (id: string, direction = "inbound", final = false) => ({
  femaleWorkflow: false, interestId: id, direction, status: "active", flowStatus: final ? "awaiting_final_approval" : "awaiting_inbound_response",
  visibility: "visible", paused: false, canRespond: !final, canFinalApprove: final, canWithdraw: false,
  ownFinalApproval: "pending", contactSharedAt: null as number | null,
  counterparty: { label: "Applicant " + id, applicantNumber: 901, age: 30, gender: "female", fullProfileVisible: true,
    imageUrls: [], shareableBio: "Authorized bio " + id, email: null as string | null, phone: null },
});
const review = (id: string, role: Role) => ({ interestId: id, role, state: "in_review", ownAction: "review" as string | null, ownDecision: "pending", paused: false, canView: true });
const match = (id: string) => ({
  _id: id, status: "reviewing", presentedAt: now - 1000, contactShared: false, canApprove: true, canWithdraw: true, myApproval: false,
  partner: { publicApplicantNumber: 902, age: 30, images: [], shareableBio: "Introduction bio " + id, email: undefined as string | undefined },
});
const event = (id: string, registrationStatus: string, confirmationStatus = "not_confirmed", expired = false) => ({
  _id: id, title: "Event " + id, startsAt: now + 86400000, location: "Synthetic venue",
  registration: { _id: "registration-" + id, registrationStatus, confirmationStatus,
    confirmationRequestedAt: now - 1000, confirmationExpiresAt: now + (expired ? -1000 : 86400000) },
});
function fixture(role: Role) {
  const gender = role === "brother" ? "male" : "female";
  return {
    me: { applicant: { name: "Synthetic Applicant", gender, status: "approved", applicantNumber: 999, profileCompletionStatus: "completed" },
      inbound: [] as ReturnType<typeof interest>[], outbound: [] as ReturnType<typeof interest>[], privateDocumented: [] as ReturnType<typeof interest>[],
      canSubmitInterest: false, interestSubmissionLimit: 3, interestSubmissions: [], eventLogisticsRestricted: false },
    reviews: [] as ReturnType<typeof review>[],
    reviewContacts: {} as Record<string, string | null>,
    matches: [] as ReturnType<typeof match>[],
    events: [] as ReturnType<typeof event>[],
    logisticsRestricted: false,
    gets: [] as string[], writes: [] as string[], unexpected: [] as string[],
  };
}
async function mock(page: Page, state: ReturnType<typeof fixture>) {
  await page.routeWebSocket("**/*", socket => socket.close());
  await page.route("**/*", route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (request.method() !== "GET") {
      state.writes.push(url.pathname);
      return route.fulfill({ status: 403, json: { error: "Read-only regression fixture" } });
    }
    state.gets.push(url.pathname + url.search);
    const headers = { "cache-control": "no-store" };
    if (url.pathname === "/api/applicant/me") return route.fulfill({ headers, json: state.me });
    if (url.pathname === "/api/applicant/interest-eligibility") return route.fulfill({ headers, json: { canSubmitInterest: false } });
    if (url.pathname === "/api/applicant/profile") return route.fulfill({ headers, json: { registration: { name: "Synthetic Applicant", gender: state.me.applicant.gender, imageUrls: [], imageStorageIds: [], interestSubmissionNumbers: [] } } });
    if (url.pathname === "/api/applicant/matchmaker") return route.fulfill({ headers, json: { optedIn: true, matches: state.matches } });
    if (url.pathname === "/api/applicant/events") return route.fulfill({ headers, json: { upcoming: state.events, history: [], eligibleInterestEvents: [], logisticsRestricted: state.logisticsRestricted } });
    if (url.pathname === "/api/applicant/female-review") {
      const id = url.searchParams.get("interestId");
      if (!id) return route.fulfill({ headers, json: { page: state.reviews, isDone: true, continueCursor: "" } });
      const row = state.reviews.find(item => item.interestId === id);
      return route.fulfill({ headers, status: row ? 200 : 404, json: row ? { ...row, profile: { label: "Review " + id, imageUrls: [], shareableBio: "Authorized review bio " + id, email: state.reviewContacts[id] || null } } : { error: "Unavailable" } });
    }
    state.unexpected.push(url.pathname);
    return route.fulfill({ status: 404, json: { error: "Unmocked API blocked" } });
  });
}
async function refresh(page: Page, state: ReturnType<typeof fixture>, endpoint: string) {
  const before = state.gets.filter(url => url.startsWith(endpoint)).length;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => state.gets.filter(url => url.startsWith(endpoint)).length).toBeGreaterThan(before);
}
async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const role of ["brother", "sister"] as const) for (const input of ["mouse", "keyboard", "touch"] as const) {
  test(role + " screenshot contradiction, distinct events, " + input, async ({ browser }) => {
    const context = await browser.newContext({ hasTouch: input === "touch", viewport: { width: input === "touch" ? 390 : 1280, height: 1000 } });
    const page = await context.newPage(); const state = fixture(role);
    state.me.inbound = [{ ...interest("same"), canRespond: false }, { ...interest("different-event"), canRespond: true }];
    state.reviews = [review("same", role)];
    await mock(page, state); await page.goto(origin + "/me#applicant-interests");
    const ribbon = page.getByRole("region", { name: "Received interest updates", exact: true });
    await expect(ribbon).toHaveCount(1); await expect(ribbon.locator('[data-connection-notice]')).toHaveCount(2);
    await expect(ribbon).not.toContainText("No response is currently needed");
    const own = ribbon.locator('[data-connection-notice="same"]');
    await expect(own).toContainText(role === "brother" ? "You Have Received An Interest" : "Your review is needed");
    await fits(page);
    await page.screenshot({ path: "test-results/received-" + role + "-" + input + ".png", fullPage: true });
    const link = own.getByRole("link");
    // A focus-triggered pending refresh must not remove a pressed navigation target.
    if (input === "keyboard") { await link.focus(); await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await page.keyboard.press("Enter"); }
    else if (input === "touch") await link.tap(); else await link.click();
    await expect(page).toHaveURL(origin + "/me?femaleReview=same#inbound-interests");
    expect(context.pages()).toHaveLength(1);
    await expect(page.locator("#inbound-interests #inline-selected-review")).toBeFocused();
    await expect(page.getByRole("region", { name: "Selected profile review" })).toBeVisible();
    expect(state.writes).toEqual([]); expect(state.unexpected).toEqual([]);
    await context.close();
  });
}
test("delayed workflow authority, transitions, pagination and authorization denial", async ({ page }) => {
  const state = fixture("brother"); state.me.inbound = [{ ...interest("same"), canRespond: false }]; state.reviews = [review("same", "brother")];
  await mock(page, state);
  let delay = true; let deny = false;
  await page.route("**/api/applicant/female-review", async route => {
    if (delay) await new Promise(resolve => setTimeout(resolve, 600));
    if (deny) return route.fulfill({ status: 401, json: { error: "Unauthorized" } });
    return route.fulfill({ json: { page: state.reviews, isDone: true, continueCursor: "" } });
  });
  await page.goto("/me"); await expect(page.getByText("No response is currently needed from you. You can review your connection.", { exact: true })).toHaveCount(0);
  const ribbon = page.getByRole("region", { name: "Received interest updates", exact: true });
  await expect(ribbon).toContainText("You Have Received An Interest"); delay = false;
  state.reviews = [{ ...review("same", "brother"), ownAction: null, ownDecision: "approved" }];
  await refresh(page, state, "/api/applicant/me");
  await expect(ribbon).toContainText("Contact details will be shared after the admin reviews and approves the match.");
  state.reviews[0].state = "contacts_released"; state.reviewContacts.same = "synthetic@example.test";
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(ribbon).toContainText("Contacts are ready");
  state.reviewContacts.same = null; await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(ribbon).not.toContainText("Contacts are ready");
  state.reviews[0].state = "closed"; await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(ribbon).toContainText("Connection closed"); await expect(ribbon.getByRole("link")).toHaveCount(0);
  deny = true; await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(ribbon).toContainText("Unable to load some interest updates"); await expect(ribbon.locator('[data-connection-notice]')).toHaveCount(0);
});
test("workflow pagination retains later actionable records and distinct matchmaker introduction", async ({ page }) => {
  const state = fixture("sister"); state.me.inbound = [{ ...interest("same"), canRespond: false }]; state.matches = [match("independent")];
  await mock(page, state);
  await page.route("**/api/applicant/female-review*", route => {
    const later = new URL(route.request().url()).searchParams.has("cursor");
    return route.fulfill({ json: { page: later ? [review("same", "sister"), review("second-event", "sister")] : [], isDone: later, continueCursor: later ? "" : "next-page" } });
  });
  await page.goto("/me");
  const ribbon = page.getByRole("region", { name: "Received interest updates", exact: true });
  await expect(ribbon.locator('[data-connection-notice]')).toHaveCount(2);
  await expect(ribbon).not.toContainText("No response is currently needed");
  await expect(page.getByRole("region", { name: "Matchmaker notifications", exact: true })).toContainText("Review introduction");
});
for (const role of ["brother", "sister"] as const) for (const width of [390, 1280]) {
  test("review typography and next steps " + role + " " + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 }); const state = fixture(role); state.reviews = [review("same", role)];
    await mock(page, state);
    await page.route("**/api/applicant/female-review?interestId=*", route => route.fulfill({ json: { ...state.reviews[0], profile: { label: "Applicant #220", age: 26, education: "master", job: "Mechanical engineer", ethnicity: "Arab", shareableBio: role === "sister" ? "Authorized bio" : null, spouseRequirement1: "A thoughtful partner who values regular prayer and kindness.", spouseRequirement2: "Enjoys swimming and spending time outdoors.", spouseRequirement3: "Communicates openly and respectfully.", imageUrls: ["data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect width="800" height="400" fill="#e3ddd1"/></svg>')] } } }));
    await page.goto("/dashboard?femaleReview=same");
    const panel = page.getByRole("region", { name: "Selected profile review" }); const next = panel.getByRole("region", { name: "What happens next" });
    await expect(next).toContainText(role === "brother" ? "her full bio will become available" : "Confirm your interest after reviewing");
    await expect(next).toContainText(role === "brother" ? "and the admin approves" : "final admin approval"); await expect(next).toContainText(role === "brother" ? "If you decline" : "Decline closes");
    await expect(panel.getByRole("region", { name: "Requirements", exact: true }).getByRole("listitem")).toHaveCount(3);
    await expect(panel.getByText("Authorized bio", { exact: true })).toHaveCount(role === "sister" ? 1 : 0);
    const photo = panel.getByRole("img"); await expect(photo).toBeVisible();
    const photoBox = (await photo.boundingBox())!; const nextBox = (await next.boundingBox())!;
    expect(nextBox.y).toBeGreaterThanOrEqual(photoBox.y + photoBox.height);
    const action = panel.getByRole("button", { name: role === "brother" ? "Accept" : "Confirm interest", exact: true });
    expect((await action.boundingBox())!.y).toBeGreaterThan(nextBox.y);
    expect(await action.evaluate(el => getComputedStyle(el).fontSize)).toBe("16px");
    await fits(page); await page.screenshot({ path: "test-results/review3667-" + role + "-" + width + ".png", fullPage: true });
  });
}
for (const role of ["brother", "sister"] as const) for (const final of [false, true]) test("general interest stage explanation " + role + final, async ({ page }) => {
  const state = fixture(role); state.me.inbound = [interest("stage", "inbound", final)];
  await mock(page, state); await page.goto("/me?connection=stage#inbound-interests");
  const panel = page.locator("#inbound-interests .interest-detail-panel");
  const next = panel.getByRole("region", { name: "What happens next" });
  if (final) { await expect(next).toContainText("Confirm your interest"); await expect(next.locator("p")).toHaveCount(3); }
  else await expect(next.locator("p")).toHaveText(["This applicant has expressed interest in getting to know you better.", "If you accept, "+(role === "brother" ? "her" : "his")+" full bio will become available for you to review. Accepting does not create a match and does not share any contact details.", "A match is only created after you review "+(role === "brother" ? "her" : "his")+" bio and give your final approval, "+(role === "brother" ? "she gives hers" : "he gives his")+", and the admin approves.", "If you decline, this connection will be closed and no contact details will be shared."]);
});
for (const role of ["brother", "sister"] as const) test("review first click and denial preserve gates " + role, async ({ page }) => {
  const state = fixture(role); state.reviews = [review("same", role)]; await mock(page, state);
  let deny = false; let posts = 0;
  await page.route("**/api/applicant/female-review*", async route => {
    if (route.request().method() === "POST") { posts++; return route.fulfill({ status: 409, json: { error: "Synthetic decision denied" } }); }
    if (new URL(route.request().url()).searchParams.has("interestId")) { await new Promise(resolve => setTimeout(resolve, 200)); return route.fulfill({ status: deny ? 403 : 200, json: deny ? { error: "Review unavailable" } : { ...state.reviews[0], profile: { label: "Authorized profile", imageUrls: [] } } }); }
    return route.fulfill({ json: { page: state.reviews, isDone: true, continueCursor: "" } });
  });
  await page.goto("/dashboard?femaleReview=same");
  const button = page.getByRole("button", { name: role === "brother" ? "Accept" : "Confirm interest", exact: true });
  await expect(button).toBeVisible(); await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await button.click();
  await expect.poll(() => posts).toBe(1); await expect(page.getByRole("alert").filter({ hasText: "Synthetic decision denied" })).toBeVisible();
  deny = true; await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByText("Authorized profile", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "What happens next" })).toHaveCount(0);
});
test("independent actions survive workflow and optional contact-check failures", async ({ page }) => {
  const state = fixture("brother"); state.me.inbound = [interest("actionable"), { ...interest("ambiguous"), canRespond: false }];
  state.reviews = [{ ...review("released", "brother"), state: "contacts_released", ownAction: null }, review("workflow-action", "brother")];
  await mock(page, state); let failList = false;
  await page.route("**/api/applicant/female-review*", route => {
    if (new URL(route.request().url()).searchParams.has("interestId")) return route.abort();
    if (failList) return route.fulfill({ status: 503, json: { error: "Unavailable" } });
    return route.fulfill({ json: { page: state.reviews, isDone: true, continueCursor: "" } });
  });
  await page.goto("/me"); const ribbon = page.getByRole("region", { name: "Received interest updates", exact: true });
  await expect(ribbon.locator('[data-connection-notice="actionable"]')).toBeVisible();
  await expect(ribbon.locator('[data-connection-notice="workflow-action"]')).toBeVisible();
  await expect(ribbon).not.toContainText("Contacts are ready");
  failList = true; await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(ribbon).toContainText("Unable to load some interest updates");
  await expect(ribbon.locator('[data-connection-notice="actionable"]')).toBeVisible();
  await expect(ribbon.locator('[data-connection-notice="ambiguous"]')).toHaveCount(0);
});
for (const role of ["brother", "sister"] as const) test("inline later-page selection, refresh, history and denial " + role, async ({ page, context }) => {
  const state = fixture(role); state.reviews = [review("first", role), review("later", role)];
  await mock(page, state); let denied = false;
  await page.route("**/api/applicant/female-review*", async route => {
    const params = new URL(route.request().url()).searchParams;
    const id = params.get("interestId");
    if (id) {
      await new Promise(resolve => setTimeout(resolve, id === "later" ? 300 : 50));
      return route.fulfill({ status: denied ? 403 : 200, json: denied ? { error: "Review unavailable" } : { ...review(id, role), profile: { label: "Authorized " + id, imageUrls: [], shareableBio: role === "sister" ? "Visible bio " + id : null } } });
    }
    return route.fulfill({ json: { page: [state.reviews[params.has("cursor") ? 1 : 0]], isDone: params.has("cursor"), continueCursor: params.has("cursor") ? null : "page-two" } });
  });
  await page.goto("/me");
  await page.evaluate(() => { (window as unknown as { documentMarker: boolean }).documentMarker = true; });
  const ribbon = page.getByRole("region", { name: "Received interest updates", exact: true });
  await ribbon.locator('[data-connection-notice="later"]').getByRole("link").click();
  const panel = page.locator("#inbound-interests #inline-selected-review");
  await expect(panel).toContainText("Authorized later"); await expect(panel).not.toContainText("Authorized first");
  await expect(panel).toBeFocused();
  expect(await page.evaluate(() => (window as unknown as { documentMarker: boolean }).documentMarker)).toBe(true);
  expect(context.pages()).toHaveLength(1);
  await page.reload(); await expect(panel).toContainText("Authorized later");
  await ribbon.locator('[data-connection-notice="first"]').getByRole("link").click();
  await expect(panel).toContainText("Authorized first");
  await page.goBack(); await expect(panel).toContainText("Authorized later"); await expect(panel).toBeFocused();
  denied = true; await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(panel).not.toContainText("Authorized later"); await expect(panel.getByRole("button", { name: "Accept", exact: true })).toHaveCount(0);
  await expect(page.getByRole("alert").filter({ hasText: "Review unavailable" })).toBeVisible();
  expect(state.writes).toEqual([]); expect(state.unexpected).toEqual([]);
});
test("inline reopening restores focus and old decline cannot clear new selection", async ({ page }) => {
  const state = fixture("brother"); state.reviews = [review("first", "brother"), review("second", "brother")]; await mock(page, state);
  let finish: (() => void) | undefined;
  await page.route("**/api/applicant/female-review*", async route => {
    if (route.request().method() !== "POST") return route.fallback();
    await new Promise<void>(resolve => { finish = resolve; });
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/me#applicant-interests");
  await page.getByRole("region", { name: "Received interest updates", exact: true }).locator('[data-connection-notice="first"]').getByRole("link").click();
  const panel = page.locator("#inline-selected-review"); await expect(panel).toBeFocused();
  await expect(page.getByRole("link", { name: "Back to applicant interests" })).toHaveCount(0);
  await page.goBack();
  await expect(panel).toHaveCount(0);
  const ribbon = page.getByRole("region", { name: "Received interest updates", exact: true });
  await ribbon.locator('[data-connection-notice="first"]').getByRole("link").click(); await expect(panel).toBeFocused();
  await panel.getByRole("button", { name: "Decline", exact: true }).click();
  await expect.poll(() => !!finish).toBe(true);
  await ribbon.locator('[data-connection-notice="second"]').getByRole("link").click();
  await expect(panel).toContainText("Review second"); finish!();
  await expect(page.getByText("Recording your decision…")).toHaveCount(0);
  await expect(panel).toContainText("Review second"); await expect(page).toHaveURL(/femaleReview=second/);
});
