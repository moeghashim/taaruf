import { test, expect } from "@playwright/test";
for (const width of [1280, 390]) for (const gender of ["male", "female"]) test(
  "overview hides expired cards " + width + " " + gender, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 900 });
  let expired = false;
  let profile = { name: "Synthetic Applicant", gender, email: "synthetic@example.invalid", dateOfBirth: "1996-05-14", education: "bachelor", ethnicity: "Arab", prayerCommitment: "always_five", hijabResponse: "yes", spouseRequirement1: "Kind", spouseRequirement2: "Patient", spouseRequirement3: "Practicing", shareableBio: "Synthetic bio", photoSharingPermission: "no", imageStorageIds: ["synthetic-image"], images: [{ storageId: "synthetic-image", url: "/favicon.ico" }], imageUrls: ["/favicon.ico"], interestSubmissionNumbers: [], profileCompletionStatus: "completed" };
  const calls: {url: string; body: Record<string, unknown>}[] = [];
  let optedIn = false;
  await page.route("**/api/**", route => {
    const url = new URL(route.request().url()).pathname;
    const post = route.request().method() === "POST";
    const body = post ? route.request().postDataJSON() : {};
    if (post) calls.push({url, body});
    if (expired) return route.fulfill({ status: 401, json: {error:"Session expired"} });
    if (url === "/api/applicant/profile") {
      if (post) profile = {...profile, ...body};
      return route.fulfill({json:{registration:profile,success:true}});
    }
    const eligibility = {canSubmitInterest:true, interestSubmissionLimit:3, interestSubmissionEventId:"synthetic-event",interestSubmissions:[]};
    if (url === "/api/applicant/me") return route.fulfill({json:{applicant:{name:profile.name,gender,applicantNumber:999,profileCompletionStatus:"completed",status:"approved"},inbound:[],outbound:[],privateDocumented:[],...eligibility}});
    if (url === "/api/applicant/interest-eligibility") return route.fulfill({json:eligibility});
    if (url === "/api/applicant/events") return route.fulfill({json:{upcoming:[{_id:"past-pending",title:"1 Plus 1 Match Workshop",location:"Synthetic",startsAt:1,endsAt:2,status:"scheduled",registration:{_id:"pending",registrationStatus:"pending",confirmationStatus:"pending",attendanceStatus:"not_attended"}},{_id:"past-unregistered",title:"Real Talk",location:"Synthetic",startsAt:1,endsAt:2,status:"scheduled",registration:null},{_id:"synthetic-event",title:"Synthetic event",location:"Synthetic venue",startsAt:Date.now()+86400000,endsAt:Date.now()+90000000,status:"published",registration:null}],history:[],success:true}});
    if (url === "/api/applicant/female-review") return route.fulfill({json:{page:[],isDone:true,continueCursor:""}});
    if (url === "/api/applicant/matchmaker") { if(post) optedIn=Boolean(body.optedIn); return route.fulfill({json:{optedIn,matches:[],success:true}}); }
    if (url === "/api/applicant/interests") return route.fulfill({json:{success:true}});
    return route.fulfill({status:400,json:{error:"Unexpected synthetic route"}});
  });
  await page.goto("/me");
  const nav = page.getByRole("navigation",{name:"Applicant pages"});
  const go = (name: string) => nav.getByRole("link",{name,exact:true}).click();
  const screenshot = async (name: string) => { await page.evaluate(()=>window.scrollTo(0,0)); await page.waitForTimeout(250); await page.screenshot({path:testInfo.outputPath(name),fullPage:true,animations:"disabled"}); };
  await expect(page.getByRole("heading",{name:"Events",exact:true})).toBeVisible();
  await expect(page.getByRole("heading",{name:"1 Plus 1 Match Workshop",exact:true})).toHaveCount(0);
  await expect(page.getByRole("heading",{name:"Real Talk",exact:true})).toHaveCount(0);
  await expect(page.getByRole("heading",{name:"Synthetic event",exact:true})).toBeVisible();
  await screenshot("overview-past-hidden.png");expect(calls).toEqual([]);
});
