import { expect, test, type Page } from "@playwright/test";

// Production Next renderer, synthetic authorized GETs only. Run with
// playwright.ribbon3554.config.ts; never contact auth/Convex or mutate real data.
const origin = "http://127.0.0.1:3554";
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

for (const width of [320, 1280]) for (const role of ["brother", "sister"] as const) {
  test(role + " unified interest counts, destinations and focus refresh " + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const state = fixture(role);
    state.me.inbound = [interest("initial-one"), interest("initial-two"), { ...interest("paused"), paused: true }, { ...interest("closed"), status: "closed" }];
    state.me.outbound = [interest("final-one", "outbound", true), interest("final-two", "outbound", true)];
    state.me.privateDocumented = [{ ...interest("private", "private"), visibility: "private", femaleWorkflow: true }];
    await mock(page, state);
    await page.goto("/me");
    const notices = page.getByRole("region", { name: "Your notifications", exact: true });
    const actionable = notices.getByRole("region", { name: "You have interests to review", exact: true });
    for (const hash of views) {
      await page.getByRole("navigation", { name: "Applicant pages" }).locator('a[href="' + hash + '"]').click();
      await expect(notices).toBeVisible();
      await expect(actionable).toContainText("4 awaiting your response.");
      await expect(actionable.getByRole("link")).toHaveCount(4);
      for (const [index, id] of ["initial-one", "initial-two", "final-one", "final-two"].entries()) {
        await expect(actionable.getByRole("link").nth(index)).toHaveAttribute("href", "/me?connection=" + id + (index < 2 ? "#inbound-interests" : "#outbound-interests"));
      }
      await expect(actionable.locator('a[href*="paused"], a[href*="closed"], a[href*="private"]')).toHaveCount(0);
      await expect(notices.locator('a[href*="closed"], a[href*="private"]')).toHaveCount(0);
      await fits(page);
    }
    await actionable.locator('a[href*="final-two"]').click();
    const selected = page.locator('[data-interest-id="final-two"]');
    await expect(selected).toHaveAttribute("aria-pressed", "true");
    await expect(selected).toBeFocused();
    await expect(page.locator("#outbound-interests .interest-detail-panel")).toContainText("Authorized bio final-two");
    await expect(page.locator("#outbound-interests").getByRole("button", { name: "Final Approval", exact: true })).toBeVisible();
    state.me.inbound = state.me.inbound.map(row => ({ ...row, canRespond: false }));
    state.me.outbound = state.me.outbound.map(row => ({ ...row, canFinalApprove: false, ownFinalApproval: "approved" }));
    await refresh(page, state, "/api/applicant/me");
    await expect(actionable).toHaveCount(0);
    await expect(notices.getByText("Contact details will be shared after the admin reviews and approves the match.", { exact: true })).toHaveCount(2);
    await expect(page.locator("#outbound-interests .notice.success")).toHaveText("Contact details will be shared after the admin reviews and approves the match.");
    await expect(page.locator("#outbound-interests").getByRole("button", { name: "Final Approval", exact: true })).toHaveCount(0);
    expect(state.writes).toEqual([]);
    expect(state.unexpected).toEqual([]);
  });

  test(role + " review CTAs resolve and contacts require authorized detail values " + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const state = fixture(role);
    state.reviews = [review("review-one", role), review("review-two", role)];
    await mock(page, state);
    await page.goto("/me#profile");
    const notices = page.getByRole("region", { name: "Your notifications", exact: true });
    const reviews = notices.locator("#review-notifications");
    await expect(reviews.getByRole("heading", { name: "Your review is needed" })).toHaveCount(1);
    await expect(reviews.locator('a[href*="femaleReview="]')).toHaveCount(2);
    await expect(reviews.locator('a[href*="femaleReview="]').nth(1)).toHaveAttribute("href", "/dashboard?femaleReview=review-two");
    state.reviews = state.reviews.map(row => ({ ...row, ownAction: null, ownDecision: "approved", state: "contacts_released" }));
    state.reviewContacts["review-two"] = "authorized-review@example.invalid";
    await refresh(page, state, "/api/applicant/female-review");
    await expect(reviews.getByRole("heading", { name: "Your review is needed" })).toHaveCount(0);
    const ready = reviews.locator(".contacts-ready");
    await expect(ready.getByRole("link")).toHaveCount(1);
    await expect(ready.getByRole("link")).toHaveAttribute("href", "/dashboard?femaleReview=review-two#contact-details");
    await expect(notices).not.toContainText("authorized-review@example.invalid");
    await ready.getByRole("link").click();
    const contacts = page.getByRole("region", { name: "Contact details", exact: true });
    await expect(contacts).toContainText("authorized-review@example.invalid");
    state.reviewContacts["review-two"] = null;
    await refresh(page, state, "/api/applicant/female-review");
    await expect(contacts).toHaveCount(0);
    await expect(page.getByText("authorized-review@example.invalid", { exact: true })).toHaveCount(0);
    await fits(page);
    expect(state.writes).toEqual([]);
    expect(state.unexpected).toEqual([]);
  });

  test(role + " matchmaker pending agreement, per-ID contacts and fresh permissions " + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const state = fixture(role);
    state.matches = [match("pending-one"), match("pending-two"),
      { ...match("paused-match"), status: "paused", canApprove: false },
      { ...match("closed-match"), status: "closed", canApprove: false, canWithdraw: false },
      { ...match("shared-no-values"), contactShared: true, canApprove: false, canWithdraw: false },
      ...["shared-one", "shared-two"].map(id => ({ ...match(id), contactShared: true, canApprove: false, canWithdraw: false,
        partner: { ...match(id).partner, email: id + "@example.invalid" } }))];
    await mock(page, state);
    await page.goto("/me#profile");
    const notices = page.getByRole("region", { name: "Your notifications", exact: true });
    const pending = notices.getByRole("region", { name: "Matchmaker review needed", exact: true });
    const ready = notices.getByRole("region", { name: "Matchmaker contacts are ready", exact: true });
    await expect(pending.getByRole("link")).toHaveCount(2);
    await expect(ready.getByRole("link")).toHaveCount(2);
    for (const [index, id] of ["pending-one", "pending-two"].entries()) await expect(pending.getByRole("link").nth(index)).toHaveAttribute("href", "/me?matchmaker=" + id + "#matchmaker-matching");
    for (const [index, id] of ["shared-one", "shared-two"].entries()) await expect(ready.getByRole("link").nth(index)).toHaveAttribute("href", "/me?matchmaker=" + id + "#matchmaker-matching");
    await expect(pending.locator('a[href*="paused-match"], a[href*="closed-match"]')).toHaveCount(0);
    await expect(ready.locator('a[href*="shared-no-values"]')).toHaveCount(0);
    await expect(notices).not.toContainText("@example.invalid");
    await pending.getByRole("link").nth(1).click();
    const selected = page.locator("#matchmaker-match-pending-two");
    await expect(selected).toBeFocused();
    await expect(selected).toContainText("Introduction bio pending-two");
    await expect(selected.getByRole("button", { name: "Agree to this introduction", exact: true })).toBeEnabled();
    state.matches = state.matches.map(row => ({ ...row, canApprove: false, myApproval: row._id.startsWith("pending") || row.myApproval }));
    await refresh(page, state, "/api/applicant/matchmaker");
    await expect(pending).toHaveCount(0);
    await expect(selected.getByRole("button", { name: "Agree to this introduction", exact: true })).toHaveCount(0);
    await ready.getByRole("link").nth(1).click();
    const shared = page.locator("#matchmaker-match-shared-two");
    await expect(shared).toBeFocused();
    await expect(shared).toContainText("shared-two@example.invalid");
    state.matches = state.matches.map(row => row._id === "shared-two" ? { ...row, partner: { ...row.partner, email: undefined } } : row);
    await refresh(page, state, "/api/applicant/matchmaker");
    await expect(ready.getByRole("link")).toHaveCount(1);
    await expect(shared).not.toContainText("shared-two@example.invalid");
    await fits(page);
    expect(state.writes).toEqual([]);
    expect(state.unexpected).toEqual([]);
  });

  test(role + " only eligible event confirmations notify across portal views " + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const state = fixture(role);
    state.events = [event("eligible", "approved"), event("rejected", "rejected"), event("expired", "approved", "not_confirmed", true), event("confirmed", "approved", "confirmed")];
    await mock(page, state);
    await page.goto("/me");
    const notices = page.getByRole("region", { name: "Your notifications", exact: true });
    for (const hash of views) {
      await page.getByRole("navigation", { name: "Applicant pages" }).locator('a[href="' + hash + '"]').click();
      await expect(notices.getByRole("heading", { name: "Event response requested", exact: true })).toHaveCount(1);
      await expect(notices.getByRole("link", { name: "Review event registration", exact: true })).toHaveAttribute("href", "#events");
      await expect(notices).toContainText("Responding does not grant event approval.");
      await fits(page);
    }
    await notices.getByRole("link", { name: "Review event registration", exact: true }).click();
    await expect(page.locator("#events").getByRole("button", { name: "Confirm", exact: true })).toHaveCount(1);
    state.events[0].registration.confirmationStatus = "confirmed";
    await refresh(page, state, "/api/applicant/events");
    await expect(notices.getByRole("heading", { name: "Event response requested", exact: true })).toHaveCount(0);
    state.events[0].registration.confirmationStatus = "not_confirmed";
    state.logisticsRestricted = true;
    await refresh(page, state, "/api/applicant/events");
    await expect(page.locator("#events")).toContainText("Event details are unavailable.");
    await expect(notices.getByRole("heading", { name: "Event response requested", exact: true })).toHaveCount(0);
    expect(state.writes).toEqual([]);
    expect(state.unexpected).toEqual([]);
  });
}

test("failed mutation and stale GET cannot strand or restore revoked details", async ({page}) => {
 const state=fixture("brother");state.me.inbound=[interest("race")];await mock(page,state);await page.goto("/me?connection=race#inbound-interests");
 await expect(page.locator("#inbound-interests .interest-detail-panel")).toContainText("Authorized bio race");
 await page.route("**/api/applicant/me*",route=>route.fulfill({status:503,json:{error:"Refresh unavailable"}}));
 await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
 await expect(page.locator("#inbound-interests .interest-detail-panel")).toHaveCount(0);
 await expect(page.getByRole("region",{name:"Your notifications",exact:true})).toHaveCount(0);
 await page.unroute("**/api/applicant/me*");await page.getByRole("button",{name:"Retry refresh"}).click();
 await expect(page.locator("#inbound-interests .interest-detail-panel")).toContainText("Authorized bio race");
 const accept=page.locator("#inbound-interests").getByRole("button",{name:"Accept",exact:true});await accept.click();
 await expect(page.getByRole("alert").filter({hasText:"Read-only regression fixture"})).toBeVisible();
 await expect(page.getByRole("region",{name:"Your notifications",exact:true})).toBeVisible();await expect(accept).toBeEnabled();expect(state.writes).toEqual(["/api/applicant/interests"]);
});
