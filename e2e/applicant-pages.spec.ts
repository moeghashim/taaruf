import { test, expect } from "@playwright/test";
for (const width of [1280, 820, 390, 320]) for (const gender of ["male", "female"]) test(
  "four pages, history, edits and actions " + width + " " + gender, async ({ page }, testInfo) => {
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
    if (url === "/api/applicant/events") return route.fulfill({json:{upcoming:[{_id:"synthetic-event",title:"Synthetic event",location:"Synthetic venue",startsAt:Date.now()+86400000,endsAt:Date.now()+90000000,status:"published",registration:null}],history:[],success:true}});
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
  await expect(page.getByLabel(/date of birth/i)).toBeHidden();
  await screenshot("overview.png");
  await page.getByRole("button",{name:"Register",exact:true}).click();
  expect(calls.some(c=>c.body.action==="register")).toBe(true);
  await go("Applicant Interests");
  await expect(page.getByRole("heading",{name:"Inbound Interests",exact:true})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Events",exact:true})).toBeHidden();
  await expect(page.getByRole("heading",{name:"Private Documented Interests",exact:true})).toHaveCount(gender==="female"?1:0);
  await page.getByLabel("Interest 1 · Applicant #").fill("123");
  await page.getByLabel("First name",{exact:true}).first().fill("Synthetic");
  await page.getByRole("button",{name:"Submit interest",exact:true}).first().click();
  expect(calls.some(c=>c.body.action==="submit_number")).toBe(true);
  await screenshot("interests.png");
  await go("My Profile");
  await expect(page.locator("#birthday-help")).toHaveText("Please add your date of birth for our records and background checks. Only your age is shared with matches.");
  const fields = await page.locator(".profile-basics input, .profile-basics select").evaluateAll(nodes => nodes.map(node => { const r=node.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width}; }));
  expect(fields).toHaveLength(6);
  if (width > 768) {
    for (let i=0;i<6;i+=2) { expect(Math.abs(fields[i].w-fields[i+1].w)).toBeLessThan(2); expect(Math.abs(fields[i].y-fields[i+1].y)).toBeLessThan(2); }
  } else { for (const field of fields) expect(field.x).toBe(fields[0].x); }
  await page.getByLabel(/date of birth/i).fill("1995-04-03");
  await page.getByLabel("Education level").selectOption("master");
  await go("Overview");
  await expect(page.getByText("Your unsaved profile changes are kept here.",{exact:false})).toBeVisible();
  await page.goBack();
  await expect(page.getByLabel(/date of birth/i)).toHaveValue("1995-04-03");
  await page.goForward(); await expect(page.getByRole("heading",{name:"Events",exact:true})).toBeVisible();
  await go("My Profile");
  await screenshot("profile.png");
  await page.getByRole("button",{name:"Save Profile",exact:true}).click();
  await expect(page.getByText("Your profile has been saved.")).toBeVisible();
  expect(profile.dateOfBirth).toBe("1995-04-03"); expect(profile.education).toBe("master");
  await page.reload(); await expect(page.getByLabel(/date of birth/i)).toHaveValue("1995-04-03");
  await go("Matchmaker Matching");
  await expect(page.getByText("No matchmaker introductions yet")).toBeVisible();
  await expect(page.getByText(/drafts/i)).toHaveCount(0);
  await page.getByRole("checkbox").click(); await expect(page.getByRole("checkbox")).toBeChecked();
  await screenshot("matchmaker.png");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.reload(); await expect(page.getByRole("checkbox")).toBeChecked();
  for (const hash of ["#profile","#matchmaker-matching","#inbound-interests","#outbound-interests","#private-documented-interests","#events"]) {
    await page.goto("/me"+hash);
    await expect(nav.locator('[aria-current="page"]')).toHaveText(hash==="#profile"?"My Profile":hash==="#matchmaker-matching"?"Matchmaker Matching":hash==="#events"?"Overview":"Applicant Interests");
  }
  await page.goto("/me?connection=synthetic"); await expect(nav.locator('[aria-current="page"]')).toHaveText("Applicant Interests");
  await go("My Profile"); await page.getByLabel("Ethnicity",{exact:false}).fill("Unsaved");
  expired=true; await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
  await expect(page.getByText(/Your session expired/)).toBeVisible();
  await expect(page.getByLabel("Ethnicity",{exact:false})).toHaveValue("Unsaved");
  await go("Matchmaker Matching");
  await expect(page.getByText(/Your session expired/)).toBeVisible();
  await go("My Profile");
  await expect(page.getByLabel("Ethnicity",{exact:false})).toHaveValue("Unsaved");
});

for (const width of [1280, 390, 320]) test("event privacy and live eligibility revalidation " + width, async ({ page }, testInfo) => {
 page.on("pageerror", error => console.error(error));
 await page.setViewportSize({width,height:900});
 let rejected=false;
 await page.route("**/*",async route=>{
  const url=new URL(route.request().url()); if(url.origin!=="http://127.0.0.1:3418") return route.abort(); if(!url.pathname.startsWith("/api/")) return route.continue();
  const path=new URL(route.request().url()).pathname;
  const eligibility={eventLogisticsRestricted:rejected,canSubmitInterest:false,interestSubmissionEventId:null,interestSubmissions:[],interestSubmissionLimit:3};
  if(path==="/api/applicant/me") return route.fulfill({json:{...eligibility,applicant:{name:"Synthetic",gender:"male",status:rejected?"rejected":"approved",applicantNumber:1,profileCompletionStatus:"completed"},inbound:[],outbound:[],privateDocumented:[]}});
  if(path==="/api/applicant/interest-eligibility") return route.fulfill({json:eligibility});
  if(path==="/api/applicant/events") return route.fulfill({json:rejected?{logisticsRestricted:true,upcoming:[],history:[{_id:"row",registrationStatus:"approved",attendanceStatus:"attended",event:null}]}:{logisticsRestricted:false,upcoming:[{_id:"event",title:"Secret venue November 14",location:"Private location",startsAt:1794697200000,registration:null}],history:[{_id:"row",registrationStatus:"approved",attendanceStatus:"attended",event:{title:"Secret venue November 14",location:"Private location",startsAt:1794697200000}}]}});
  if(path==="/api/applicant/profile") return route.fulfill({json:{registration:{name:"Synthetic",gender:"male",email:"synthetic@example.invalid",education:"College",ethnicity:"Arab",images:[],imageUrls:[],interestSubmissionNumbers:[]}}});
  if(path==="/api/applicant/matchmaker") return route.fulfill({json:{optedIn:false,matches:[]}});
  return route.fulfill({json:{page:[],isDone:true,continueCursor:null}});
 });
 await page.goto("http://127.0.0.1:3418/me#events");
 const section=page.locator("#events");
 await expect(section.getByRole("button",{name:"Register",exact:true})).toBeVisible();
 await expect(section).toContainText("Private location");
 rejected=true;
 await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
 await expect(section).not.toContainText("Private location",{timeout:10000});
 await expect(section).not.toContainText("November 14");
 await expect(section.getByRole("button",{name:/Register|Confirm/})).toHaveCount(0);
 await expect(section).toContainText("Approved");
 for (const label of ["Applicant Interests", "My Profile", "Matchmaker Matching", "Overview"]) {
 await page.getByRole("navigation",{name:"Applicant pages"}).getByRole("link",{name:label,exact:true}).click();
 await expect(page.locator("body")).not.toContainText("Private location");
 await expect(page.locator("body")).not.toContainText("November 14");
 await expect(section.getByRole("button",{name:/Register|Confirm/})).toHaveCount(0);
 }
 await page.reload();
 await expect(section).toContainText("Your registration history is retained");
 await expect(section).not.toContainText("Private location");
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:testInfo.outputPath("rejected-logistics-"+width+".png"),fullPage:true});
});
