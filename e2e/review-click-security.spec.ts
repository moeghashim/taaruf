import {test,expect} from "@playwright/test";
for (const status of [401,409,500]) test("focus access failure clears sensitive content " + status,async({page})=>{
 let denied=false;let detail=0;
 await page.route("**/api/**",async route=>{
 const u=new URL(route.request().url()); if(u.pathname!=="/api/applicant/female-review") return route.abort();
 const review={interestId:"synthetic",role:"brother",state:"contacts_released",matchId:"match"};
 if(u.searchParams.has("interestId")){detail++; if(denied)return route.fulfill({status,json:{error:"Review unavailable"}});return route.fulfill({json:{...review,profile:{label:"Synthetic sensitive",email:"synthetic@example.invalid",phone:"synthetic-phone",imageUrls:[]}}});}
 return route.fulfill({json:{page:[review],isDone:true,continueCursor:""}});
 });
 await page.goto("/dashboard?femaleReview=synthetic");await expect(page.getByText("synthetic@example.invalid")).toBeVisible();await page.waitForTimeout(100);denied=true;await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
 await expect(page.getByText("synthetic@example.invalid")).toHaveCount(0);await expect(page.getByText("Synthetic sensitive")).toHaveCount(0);await expect(page.getByRole("alert").filter({hasText:"Review unavailable"})).toBeVisible();expect(detail).toBeGreaterThan(1);
});
for (const status of [200,401,409,500]) test("double activation and explicit server result " + status,async({page})=>{
 let posts=0;let changed=false;
 await page.route("**/api/**",async route=>{
 if(route.request().method()==="POST"){posts++;await new Promise(r=>setTimeout(r,500));changed=status===200;return route.fulfill({status,json:status===200?{success:true}:{error:"Not recorded"}});}
 const u=new URL(route.request().url());const review={interestId:"synthetic",role:"brother",state:changed?"awaiting_sister_confirmation":"awaiting_brother_review"};return route.fulfill({json:u.searchParams.has("interestId")?{...review,profile:{label:"Synthetic profile",imageUrls:[]}}:{page:[review],isDone:true,continueCursor:""}});
 });
 await page.goto("/dashboard?femaleReview=synthetic");const b=page.getByRole("button",{name:"Accept",exact:true});await expect(b).toBeVisible();await page.waitForTimeout(100);
 await b.evaluate(el=>{(el as HTMLButtonElement).click();(el as HTMLButtonElement).click();});
 await expect(page.getByRole("status").filter({hasText:"Recording your decision"})).toBeVisible();await expect(page.getByText("Your decision is recorded.",{exact:false})).toHaveCount(0);
 if(status===200)await expect(page.getByRole("status").filter({hasText:"Your decision is recorded"})).toBeVisible();else await expect(page.getByRole("alert").filter({hasText:"Not recorded"})).toBeVisible();await page.waitForTimeout(700);expect(posts).toBe(1);
});
