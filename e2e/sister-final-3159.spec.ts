import { expect, test } from "@playwright/test";
for (const width of [1280, 390, 320]) test("sister final approval notice and safe decisions " + width, async ({page}, info) => {
  await page.setViewportSize({width,height:950});
  let state = "awaiting_sister_confirmation"; let count = 1; let role = "sister"; let paused = false; let matchId: string | undefined;
  const actions: unknown[] = [];
  await page.routeWebSocket("**/*", ws => ws.close());
  await page.route("**/*", route => {
    const u = new URL(route.request().url());
    if(u.origin !== new URL(process.env.PREVIEW_URL || "http://127.0.0.1:3193").origin) return route.abort();
    if(!u.pathname.startsWith("/api/")) return route.continue();
    if(u.pathname === "/api/applicant/me") return route.fulfill({json:{applicant:{name:"Synthetic Sister",gender:"female",status:"approved",applicantNumber:999,profileCompletionStatus:"completed"},inbound:[],outbound:[],privateDocumented:[],canSubmitInterest:false,interestSubmissionLimit:3,interestSubmissions:[]}});
    if(u.pathname === "/api/applicant/events") return route.fulfill({json:{upcoming:[],history:[],eligibleInterestEvents:[]}});
    if(u.pathname === "/api/applicant/female-review") {
      if(route.request().method() === "POST") { const body=route.request().postDataJSON(); actions.push(body); state=body.confirmed?"pending_admin_approval":"declined"; return route.fulfill({json:{success:true}}); }
      // This timestamp expires the brother invitation, not the separate sister confirmation stage.
      const review={state,role,paused,matchId,reviewExpiresAt:Date.now()-86400000};
      return route.fulfill({json:u.searchParams.has("interestId")?{...review,profile:{label:"Synthetic Brother",age:30,imageUrls:[]}}:{page:Array.from({length:count},(_,i)=>({...review,interestId:"synthetic-"+i})),isDone:true,continueCursor:""}});
    }
    return route.fulfill({status:400,json:{error:"Synthetic only"}});
  });
  const banner=page.locator(".sister-confirmation");
  await page.goto("/me");
  await expect(banner.getByRole("heading")).toHaveText("The brother has accepted — your final approval is needed");
  await expect(banner).toContainText("A match will only be created after you confirm.");
  await expect(banner).toContainText("You can confirm or decline after reviewing.");
  await expect(banner).toContainText("Contact details stay private until final admin approval.");
  const cta=banner.getByRole("link",{name:"Review profile and respond",exact:true});
  expect((await cta.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  expect(await page.locator("body").evaluate(el=>el.scrollWidth<=innerWidth)).toBe(true);
  await cta.focus(); await expect(cta).toBeFocused();
  await page.screenshot({path:info.outputPath("notice-"+width+".png"),fullPage:true});
  await cta.click();
  const selected=page.getByRole("region",{name:"Selected profile review",exact:true});
  await expect(selected.getByRole("heading",{name:"Synthetic Brother",exact:true})).toBeVisible();
  expect(actions).toEqual([]);
  await expect(selected.locator(".contact-box")).toHaveCount(0);
  await expect(selected.getByRole("button",{name:"Decline",exact:true})).toBeVisible();
  await selected.screenshot({path:info.outputPath("explicit-decision-"+width+".png")});
  await selected.getByRole("button",{name:"Confirm mutual interest",exact:true}).click();
  await expect(selected.getByRole("button",{name:"Confirm mutual interest",exact:true})).toHaveCount(0);
  expect(actions).toEqual([{action:"confirm",interestId:"synthetic-0",confirmed:true}]);
  await page.goto("/me"); await expect(banner).toHaveCount(0);
  state="awaiting_sister_confirmation"; await page.reload(); await cta.click();
  await selected.getByRole("button",{name:"Decline",exact:true}).click();
  await expect(page.getByText("Review declined",{exact:true})).toBeVisible();
  expect(actions[1]).toEqual({action:"confirm",interestId:"synthetic-0",confirmed:false});
  for(const terminal of ["private_documented","awaiting_brother_review","expired","declined","revoked","closed","pending_admin_approval","contacts_released"]) {
    state=terminal; await page.goto("/me"); await expect(page.getByRole("button",{name:"Refresh",exact:true})).toBeEnabled(); await expect(banner).toHaveCount(0);
  }
  state="awaiting_sister_confirmation"; role="brother"; await page.reload(); await expect(banner).toHaveCount(0);
  role="sister"; paused=true; await page.reload(); await expect(banner).toHaveCount(0);
  paused=false; matchId="existing-match"; await page.reload(); await expect(banner).toHaveCount(0);
  matchId=undefined; count=0; await page.reload(); await expect(page.getByText("No profile reviews right now.")).toBeVisible(); await expect(banner).toHaveCount(0);
  count=2; await page.reload(); await expect(banner.getByRole("link")).toHaveCount(2);
  await expect(banner.getByRole("link",{name:"Review profile and respond for review 2"})).toHaveAttribute("href","/dashboard?femaleReview=synthetic-1");
  expect(actions).toHaveLength(2);
});
