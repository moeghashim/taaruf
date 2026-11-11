import { expect, test, type Page } from "@playwright/test";

// Production Next renderer; synthetic authorized GETs only.
// Run with playwright.sent3689.config.ts; no auth/Convex or real writes.
const origin = process.env.HEADING_TEST_ORIGIN || "http://127.0.0.1:3689";
test.use({ baseURL: origin, serviceWorkers: "block" });
type Role = "brother" | "sister";
const interest = (id: string, direction = "inbound", final = false) => ({
  femaleWorkflow: false, interestId: id, direction, status: "active", flowStatus: final ? "awaiting_final_approval" : "awaiting_inbound_response",
  visibility: "visible", paused: false, canRespond: !final, canFinalApprove: final, canWithdraw: false,
  ownFinalApproval: "pending", contactSharedAt: null as number | null,
  counterparty: { label: "Applicant " + id, applicantNumber: 901, age: 30, gender: "female", fullProfileVisible: true,
    imageUrls: [], shareableBio: "Authorized bio " + id, email: null as string | null, phone: null },
});
function fixture(role: Role) {
  const gender = role === "brother" ? "male" : "female";
  return {
    me: { applicant: { name: "Synthetic Applicant", gender, status: "approved", applicantNumber: 999, profileCompletionStatus: "completed" },
      inbound: [] as ReturnType<typeof interest>[], outbound: [] as ReturnType<typeof interest>[], privateDocumented: [] as ReturnType<typeof interest>[],
      canSubmitInterest: false, interestSubmissionLimit: 3, interestSubmissions: [], eventLogisticsRestricted: false },
    reviews: [] as { interestId: string; role?: string; state?: string; ownDecision?: string; ownAction?: string | null; canView?: boolean }[],
    reviewContacts: {} as Record<string, string | null>,
    matches: [],
    events: [],
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


for (const role of ["brother", "sister"] as const) for (const width of [390, 1280]) {
  test("sent heading and lifecycle " + role + " " + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const state = fixture(role);
    state.me.outbound = [{ ...interest("sent", "outbound"), canRespond: false }];
    await mock(page, state); await page.goto("/me#applicant-interests");
    const ribbon = page.getByRole("region", { name: "Received interest updates", exact: true });
    const sent = ribbon.locator('[data-connection-notice="sent"]');
    await expect(sent.getByRole("heading")).toHaveText("You Have Sent An Interest");
    await expect(sent).toContainText("No response is currently needed from you. You can review your connection.");
    await expect(sent.getByRole("link")).toHaveText("View interest");
    await expect(sent.getByRole("link")).toHaveAttribute("href", "/me?connection=sent#outbound-interests");
    await page.screenshot({ path: "test-results/sent3689-" + role + "-" + width + ".png", fullPage: true });
    state.me.inbound = [interest("received")];
    state.me.outbound.push({ ...interest("sent2", "outbound"), canRespond: false });
    await refresh(page, state, "/api/applicant/me");
    await expect(ribbon.locator('[data-connection-notice]')).toHaveCount(3);
    await expect(ribbon.getByRole("heading", { name: "You Have Sent An Interest", exact: true })).toHaveCount(2);
    await expect(ribbon.getByRole("heading", { name: "You Have Received An Interest", exact: true })).toHaveCount(1);
    await fits(page);
    state.me.outbound[0].canFinalApprove = true;
    await refresh(page, state, "/api/applicant/me"); await expect(sent.getByRole("heading")).toHaveText("Your review is needed");
    state.me.outbound[0].canFinalApprove = false;
    state.me.outbound[0].ownFinalApproval = "approved";
    state.me.outbound[0].status = "in_progress"; state.me.outbound[0].flowStatus = "in_progress";
    await refresh(page, state, "/api/applicant/me"); await expect(sent.getByRole("heading")).toHaveText("Interest Update");
    state.me.outbound[0].contactSharedAt = Date.now(); state.me.outbound[0].counterparty.email = "synthetic@example.test";
    await refresh(page, state, "/api/applicant/me"); await expect(sent.getByRole("heading")).toHaveText("Contacts are ready");
    state.me.outbound[0].paused = true;
    await refresh(page, state, "/api/applicant/me"); await expect(sent.getByRole("heading")).toHaveText("Connection paused");
    state.me.outbound[0].status = "closed";
    await refresh(page, state, "/api/applicant/me"); await expect(sent.getByRole("heading")).toHaveText("Connection closed");
    expect(state.writes).toEqual([]); expect(state.unexpected).toEqual([]);
  });
}

for (const width of [390,1280]) test("sister actual workflow projection lifecycle " + width, async ({page}) => {
 await page.setViewportSize({width,height:1000});
 const state=fixture("sister");
 state.me.privateDocumented=[{...interest("female-sent","private"),femaleWorkflow:true,canRespond:false,status:"in_progress",flowStatus:"in_progress"}];
 state.reviews=[{interestId:"female-sent",role:"sister",state:"in_review",ownDecision:"pending",ownAction:null,canView:false}];
 await mock(page,state); await page.goto("/me#applicant-interests");
 const notice=page.locator('[data-connection-notice="female-sent"]');
 await expect(notice.getByRole("heading")).toHaveText("You Have Sent An Interest");
 state.reviews[0].canView=true;
 await refresh(page,state,"/api/applicant/female-review");
 await expect(notice.getByRole("heading")).toHaveText("You Have Sent An Interest");
 state.reviews[0].ownAction="review";
 await refresh(page,state,"/api/applicant/female-review");
 await expect(notice.getByRole("heading")).toHaveText("Your review is needed");
 await expect(notice.getByRole("link")).toHaveText("Review profile and respond");
 state.reviews[0].ownAction=null;state.reviews[0].ownDecision="approved";
 await refresh(page,state,"/api/applicant/female-review");
 await expect(notice.getByRole("heading")).toHaveText("Interest Update");
 state.reviews[0].state="contacts_released";state.reviewContacts["female-sent"]="synthetic@example.test";
 await refresh(page,state,"/api/applicant/female-review");
 await expect(notice.getByRole("heading")).toHaveText("Contacts are ready");
 state.reviews[0].state="closed";
 await refresh(page,state,"/api/applicant/female-review");
 await expect(notice.getByRole("heading")).toHaveText("Connection closed");
 await fits(page);expect(state.writes).toEqual([]);expect(state.unexpected).toEqual([]);
});
