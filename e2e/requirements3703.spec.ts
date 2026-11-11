import { expect, test, type Page } from "@playwright/test";

// Real Next renderer; synthetic authorized GETs only.
// Run with playwright.requirements3703.config.ts; no auth/Convex or real writes.
const origin = "http://127.0.0.1:3703";
test.use({ baseURL: origin, serviceWorkers: "block" });
export type Role = "brother" | "sister";
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
    reviews: [] as { interestId: string }[],
    reviewContacts: {} as Record<string, string | null>,
    matches: [] as unknown[],
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
    if (url.pathname.startsWith("/api/share/")) return route.fulfill({headers,json:{share:{includeImages:false,status:"viewed",owner:{age:26,imageUrls:[],spouseRequirement1:long,spouseRequirement2:"Respect"},recipient:{name:"Synthetic recipient"}}}});
    if (url.pathname === "/api/applicant/me") return route.fulfill({ headers, json: state.me });
    if (url.pathname === "/api/applicant/interest-eligibility") return route.fulfill({ headers, json: { canSubmitInterest: false } });
    if (url.pathname === "/api/applicant/profile") return route.fulfill({ headers, json: { registration: { name: "Synthetic Applicant", gender: state.me.applicant.gender, imageUrls: [], imageStorageIds: [], interestSubmissionNumbers: [] } } });
    if (url.pathname === "/api/applicant/matchmaker") return route.fulfill({ headers, json: { optedIn: true, matches: state.matches } });
    if (url.pathname === "/api/applicant/events") return route.fulfill({ headers, json: { upcoming: state.events, history: [], eligibleInterestEvents: [], logisticsRestricted: state.logisticsRestricted } });
    if (url.pathname === "/api/applicant/female-review") {
      const id = url.searchParams.get("interestId");
      if (!id) return route.fulfill({ headers, json: { page: state.reviews, isDone: true, continueCursor: "" } });
      const row = state.reviews.find(item => item.interestId === id);
      return route.fulfill({ headers, status: row ? 200 : 404, json: row ? { ...row, profile: { label: "Review " + id, imageUrls: [], age: 26, spouseRequirement1: long, spouseRequirement2: "Respect", shareableBio: "Authorized review bio " + id, email: state.reviewContacts[id] || null } } : { error: "Unavailable" } });
    }
    state.unexpected.push(url.pathname);
    return route.fulfill({ status: 404, json: { error: "Unmocked API blocked" } });
  });
}

const long = "Prays\nFasts and practices. " + "Thoughtful communication and shared faith. ".repeat(20) + "x".repeat(120);
for (const role of ["brother", "sister"] as const) for (const width of [320, 390, 1280]) {
 test("Requirements match profile facts " + role + " " + width, async ({page}, info) => {
  await page.setViewportSize({width,height:1000});
  const state=fixture(role);
  const row={...interest("private","outbound"),visibility:"private",canRespond:false,counterparty:{...interest("private").counterparty,age:26,education:"Masters",job:"Mech Eng",spouseRequirement1:long,spouseRequirement2:"Respect",spouseRequirement3:"Kindness"}};
  if(role === "sister") state.me.privateDocumented=[row]; else state.me.outbound=[row];
  await mock(page,state); await page.goto("/me#applicant-interests");
  const target=page.locator(".interest-detail-panel").filter({has:page.locator(".profile-requirements")});
  await expect(target.getByRole("heading",{name:"Profile details",exact:true})).toBeVisible();
  const heading=target.getByRole("heading",{name:"Requirements",exact:true});
  await expect(heading).toBeVisible();
  const typography=(el:Element)=>{const s=getComputedStyle(el);return [s.fontFamily,s.fontSize,s.fontWeight,s.letterSpacing,s.color,s.lineHeight,s.textTransform]};
  expect(await heading.evaluate(typography)).toEqual(await target.getByRole("heading",{name:"Profile details",exact:true}).evaluate(typography));
  expect(await target.locator(".profile-requirements li").first().evaluate(typography)).toEqual(await target.locator(".fact .v").first().evaluate(typography));
  expect(await heading.evaluate(el=>getComputedStyle(el).fontSize)).toBe("10px");
  const list=target.locator(".profile-requirements li");
  await expect(list.first()).toHaveText(long);
  const spacing=(el:Element)=>{const s=getComputedStyle(el);return [s.paddingTop,s.paddingBottom,s.borderBottomWidth,s.borderBottomColor]};
  expect(await list.first().evaluate(spacing)).toEqual(await target.locator(".fact").first().evaluate(spacing));
  expect(await list.first().evaluate(el=>el.scrollHeight<=el.clientHeight && el.scrollWidth<=el.clientWidth)).toBe(true);
  expect(await list.first().evaluate(el=>getComputedStyle(el).whiteSpace)).toBe("pre-wrap");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await target.screenshot({path:info.outputPath("private-documented.png")});
  expect(state.writes).toEqual([]);expect(state.unexpected).toEqual([]);
 });
}

for (const role of ["brother","sister"] as const) for (const width of [390,1280]) for (const surface of ["review","share","matchmaker"]) {
 test(surface+" requirements body matches facts "+role+" "+width,async({page},info)=>{
  await page.setViewportSize({width,height:1000});const state=fixture(role);
  state.reviews=[{interestId:"fixture",role,state:role==="brother"?"awaiting_brother_review":"awaiting_sister_confirmation"} as {interestId:string}];
  state.matches=[{_id:"fixture",status:"presented",presentedAt:1794420000000,partner:{name:"Synthetic partner",age:26,spouseRequirement1:long,spouseRequirement2:"Respect",images:[]}}];
  await mock(page,state);await page.goto(surface==="review"?"/dashboard?femaleReview=fixture":surface==="share"?"/share/fixture":"/me#matchmaker-matching");
  const target=page.locator(surface==="review"?".selected-profile-review":surface==="share"?".applicant-share":"#matchmaker-matching");
  const heading=target.getByRole("heading",{name:"Requirements",exact:true});await expect(heading).toBeVisible();
  expect(await heading.evaluate(el=>getComputedStyle(el).fontSize)).toBe("10px");
  const typography=(el:Element)=>{const s=getComputedStyle(el);return [s.fontFamily,s.fontSize,s.fontWeight,s.letterSpacing,s.color,s.lineHeight]};
  const item=target.locator(".profile-requirements li").first();
  expect(await item.evaluate(typography)).toEqual(await target.locator(".fact .v").first().evaluate(typography));
  await expect(item).toHaveText(long);
  expect(await item.evaluate(el=>el.scrollHeight<=el.clientHeight && el.scrollWidth<=el.clientWidth)).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await target.screenshot({path:info.outputPath("shared-profile.png")});expect(state.writes).toEqual([]);
 });
}
