import { expect, test, type Page } from "@playwright/test";

// Production Next renderer, synthetic authorized GETs only. Run with
// playwright.ribbon3554.config.ts; never contact auth/Convex or mutate real data.
const origin = "http://127.0.0.1:3761";
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
async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}


for (const role of ["brother", "sister"] as const) for (const width of [390,1280]) {
  for (const populated of [false,true]) test(role+" inbound duplicate "+width+" populated="+populated, async ({page}) => {
    await page.setViewportSize({width,height:1000});
    const state=fixture(role);
    state.reviews=[{...review("pending",role),ownAction:null,canView:false}];
    if(populated) state.me.inbound=[interest("received")];
    await mock(page,state); await page.goto("/me#applicant-interests");
    const inbound=page.locator("#inbound-interests");
    const ribbon=page.getByRole("region",{name:"Received interest updates",exact:true});
    await expect(ribbon).toBeVisible();
    await expect(ribbon.locator('[data-connection-notice="pending"]')).toBeVisible();
    await expect(inbound.locator(".interest-invitation")).toHaveCount(0);
    await expect(inbound).not.toContainText("Connection review");
    if(!populated) await expect(inbound).toContainText("Nothing to show right now.");
    else await expect(inbound).toContainText("Applicant received");
    await fits(page);
    await page.screenshot({path:"test-results/inbound3761-"+role+"-"+width+"-"+populated+".png",fullPage:true});
    expect(state.writes).toEqual([]); expect(state.unexpected).toEqual([]);
  });
  test(role+" inline actions retained "+width,async({page})=>{
    await page.setViewportSize({width,height:1000});const state=fixture(role);
    state.reviews=[review("action",role)];await mock(page,state);await page.goto("/me#applicant-interests");
    const ribbon=page.getByRole("region",{name:"Received interest updates",exact:true});
    await ribbon.getByRole("link").click();
    await expect(page.locator("#inline-selected-review")).toBeFocused();
    await expect(page.locator("#inline-selected-review")).toContainText("Authorized review bio action");
    await expect(page.locator("#inline-selected-review").getByRole("button",{name:role==="brother"?"Accept":"Confirm interest",exact:true})).toBeVisible();
    await expect(page.locator("#inbound-interests .interest-invitation")).toHaveCount(0);
    expect(state.writes).toEqual([]);expect(state.unexpected).toEqual([]);await fits(page);
  });
}
