import { test, expect } from "@playwright/test";
test("mocked Real Talk queue states stay visible on desktop and mobile", async ({page}) => {
  let status = "waitlisted";
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    let body: unknown = {};
    if (url.pathname === "/api/applicant/me") body = {applicant:{name:"Synthetic",gender:"male",applicantNumber:1,profileCompletionStatus:"completed"},inbound:[],outbound:[],privateDocumented:[],canSubmitInterest:false,interestSubmissions:[]};
    if (url.pathname === "/api/applicant/events") body = {upcoming:[{_id:"synthetic",title:"Real Talk Oct 20 2026",location:"Synthetic",startsAt:1792537200000,registration:{_id:"row",registrationStatus:status,confirmationStatus:"confirmed"}}],history:[],eligibleInterestEvents:[]};
    if (url.pathname === "/api/applicant/profile") return route.fulfill({status:400,json:{error:"Mock only"}});
    return route.fulfill({json:body});
  });
  for (const width of [1280,390]) {
    await page.setViewportSize({width,height:844});
    for (const next of ["waitlisted","pending","approved"]) {
      status = next;
      await page.goto("/me");
      const row = page.locator(".interest-row").filter({hasText:"Real Talk Oct 20 2026"});
      await expect(row).toContainText(next[0].toUpperCase()+next.slice(1));
      await expect(row.getByRole("button",{name:"Register",exact:true})).toHaveCount(0);
    }
  }
});

test("overflow signup message says waitlisted, not pending approval", async ({page}) => {
  let registered = false;
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/applicant/me") return route.fulfill({json:{applicant:{name:"Synthetic",gender:"male",applicantNumber:1,profileCompletionStatus:"completed"},inbound:[],outbound:[],privateDocumented:[],canSubmitInterest:false,interestSubmissions:[]}});
    if (url.pathname === "/api/applicant/events") {
      if (route.request().method() === "POST") { registered=true; return route.fulfill({json:{success:true,result:{registrationStatus:"waitlisted"}}}); }
      return route.fulfill({json:{upcoming:[{_id:"synthetic",title:"Capacity Test",location:"Synthetic",startsAt:1892537200000,registration:registered?{_id:"row",registrationStatus:"waitlisted",confirmationStatus:"confirmed"}:null}],history:[],eligibleInterestEvents:[]}});
    }
    return route.fulfill({status:400,json:{error:"Mock only"}});
  });
  await page.goto("/me");
  await page.getByRole("button",{name:"Register",exact:true}).click();
  await expect(page.getByText("You are on this event’s waitlist.",{exact:false})).toBeVisible();
  await expect(page.getByText("Your attendance is pending approval.",{exact:false})).toHaveCount(0);
});
