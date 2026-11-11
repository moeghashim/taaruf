import { expect, test, type Page } from "@playwright/test";

// Synthetic authorized GETs only; never contact auth/Convex or mutate real data.
const origin = process.env.PORTAL_BASE!;
test.use({ baseURL: origin, serviceWorkers: "block" });
type Role = "brother" | "sister";
const interest = (id: string, direction = "inbound", final = false) => ({
  femaleWorkflow: false, interestId: id, direction, status: "active", flowStatus: final ? "awaiting_final_approval" : "awaiting_inbound_response",
  visibility: "visible", paused: false, canRespond: !final, canFinalApprove: final, canWithdraw: false,
  ownFinalApproval: "pending", contactSharedAt: null as number | null,
  counterparty: { label: "Applicant " + id, applicantNumber: 901, age: 30, gender: "female", fullProfileVisible: true,
    imageUrls: [], shareableBio: "Authorized bio " + id, email: null as string | null, phone: null },
});
const review = (id: string, role: Role) => ({ interestId: id, role, state: "in_review", ownAction: "review" as string | null, ownDecision: "pending", paused: false, canView: true });
function fixture(role: Role) {
  const gender = role === "brother" ? "male" : "female";
  return {
    me: { applicant: { name: "Synthetic Applicant", gender, status: "approved", applicantNumber: 999, profileCompletionStatus: "completed" },
      inbound: [] as ReturnType<typeof interest>[], outbound: [] as ReturnType<typeof interest>[], privateDocumented: [] as ReturnType<typeof interest>[],
      canSubmitInterest: false, interestSubmissionLimit: 3, interestSubmissions: [], eventLogisticsRestricted: false },
    reviews: [] as ReturnType<typeof review>[],
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
async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}


for (const width of [320,390,1280]) for (const role of ["brother","sister"] as const) {
 test(role+" received heading preserves body and CTA "+width, async ({page})=>{
  await page.setViewportSize({width,height:1000});const state=fixture(role);state.me.inbound=[interest("initial")];await mock(page,state);await page.goto("/me");
  const banner=page.locator('section[aria-labelledby="inbound-action-heading"]');
  await expect(banner.getByRole("heading")).toHaveText("You Have Received An Interest");
  await expect(banner.locator("p")).toHaveText("1 awaiting your response. Contact details remain private until sharing is approved.");
  await expect(banner.getByRole("link",{name:"View interest",exact:true})).toHaveAttribute("href","/me?connection=initial#inbound-interests");await fits(page);
  state.me.inbound=[interest("final","inbound",true)];await page.reload();await expect(banner.getByRole("heading")).toHaveText("You have an interest to review");
  state.me.inbound=[];state.me.outbound=[interest("outbound","outbound",true)];await page.reload();await expect(banner.getByRole("heading")).toHaveText("You have an interest to review");
  expect(state.writes).toEqual([]);expect(state.unexpected).toEqual([]);
 });
 test(role+" dedicated review invitation semantics "+width,async({page},info)=>{
  await page.setViewportSize({width,height:1000});const state=fixture(role);state.reviews=[review("review-one",role)];await mock(page,state);await page.goto("/me");
  const banner=page.locator(role==="brother"?'section[aria-labelledby="interest-invitation-heading"]':'section[aria-labelledby="sister-confirmation-heading"]');
  await expect(banner.getByRole("heading")).toHaveText(role==="brother"?"You Have Received An Interest":"Your review is needed");
  await expect(banner.locator("p").first()).toHaveText("This connection is awaiting your review.");
  await expect(banner.locator("p").nth(1)).toHaveText(role==="brother"?"Accepting does not share contact details. Both of you must agree before the team can approve sharing them.":"You can confirm or decline after reviewing. Contact details stay private until final admin approval.");
  await expect(banner.getByRole("link",{name:role==="brother"?"Review profile":"Review profile and respond",exact:true})).toHaveAttribute("href","/dashboard?femaleReview=review-one");
  await fits(page);await banner.screenshot({path:info.outputPath("banner.png")});expect(state.writes).toEqual([]);expect(state.unexpected).toEqual([]);
 });
}
