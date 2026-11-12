import {test,expect} from "@playwright/test";
for(const role of ["brother","sister"]) test(role+" stale authorized response cannot restore revoked contacts",async({page})=>{
 let phase=0, held:(()=>void)|undefined, gets=0, posts=0;
 await page.routeWebSocket("**/*",ws=>ws.close());
 await page.route("**/*",async route=>{
  const u=new URL(route.request().url());if(u.origin!=="http://127.0.0.1:3226")return route.abort();
  if(!u.pathname.startsWith("/api/"))return route.continue();
  if(route.request().method()!=="GET"){posts++;return route.abort();}
  if(u.pathname!=="/api/applicant/female-review")return route.fulfill({status:400,json:{}});
  const review={interestId:"synthetic",role,state:"contacts_released"};
  if(!u.searchParams.has("interestId"))return route.fulfill({json:{page:[review],isDone:true,continueCursor:""}});
  gets++; const current=phase;
  if(current===1)await new Promise<void>(resolve=>{held=resolve;});
  return route.fulfill(current===2?{status:409,json:{error:"Access revoked"}}:{json:{...review,profile:{label:"Sensitive profile",email:"synthetic@example.invalid",phone:"synthetic-phone",imageUrls:[]}}});
 });
 await page.goto("/dashboard?femaleReview=synthetic");await expect(page.getByText("synthetic@example.invalid")).toBeVisible();await page.waitForTimeout(100);
 phase=1;await page.evaluate(()=>window.dispatchEvent(new Event("focus")));await expect.poll(()=>!!held).toBe(true);
 await expect(page.getByText("synthetic@example.invalid")).not.toBeVisible();await expect(page.getByText("Sensitive profile")).not.toBeVisible();
 phase=2;await page.evaluate(()=>window.dispatchEvent(new Event("focus")));await expect(page.getByRole("alert").filter({hasText:"Access revoked"})).toBeVisible();
 held!();await page.waitForTimeout(250);await expect(page.getByText("synthetic@example.invalid")).toHaveCount(0);await expect(page.getByText("Sensitive profile")).toHaveCount(0);expect(posts).toBe(0);expect(gets).toBeGreaterThan(2);
});

for(const status of [200,401,409,500]) test("focus during pending POST rejects late stale GET "+status,async({page})=>{
 let posts=0, pending=false, releasePost:(()=>void)|undefined, releaseGet:(()=>void)|undefined;
 await page.routeWebSocket("**/*",ws=>ws.close());
 await page.route("**/*",async route=>{
 const u=new URL(route.request().url());if(u.origin!=="http://127.0.0.1:3226")return route.abort();if(!u.pathname.startsWith("/api/"))return route.continue();if(u.pathname!=="/api/applicant/female-review")return route.fulfill({status:400,json:{}});
 if(route.request().method()==="POST"){posts++;pending=true;await new Promise<void>(r=>{releasePost=r;});pending=false;return route.fulfill({status,json:status===200?{success:true}:{error:"Decision denied"}});}
 const review={interestId:"synthetic",role:"brother",state:posts&&!pending?"pending_admin_approval":"awaiting_brother_review"};
 if(!u.searchParams.has("interestId"))return route.fulfill({json:{page:[review],isDone:true,continueCursor:""}});
 if(pending)await new Promise<void>(r=>{releaseGet=r;});
 return route.fulfill({json:{...review,profile:{label:pending?"Old sensitive profile":"Synthetic profile",imageUrls:[]}}});
 });
 await page.goto("/dashboard?femaleReview=synthetic");const accept=page.getByRole("button",{name:"Accept",exact:true});await expect(accept).toBeVisible();await page.waitForTimeout(100);await accept.click();await expect.poll(()=>!!releasePost).toBe(true);
 await page.evaluate(()=>window.dispatchEvent(new Event("focus")));await expect.poll(()=>!!releaseGet).toBe(true);releasePost!();
 if(status===200)await expect(page.getByRole("status").filter({hasText:"Your decision is recorded"})).toBeVisible();else await expect(page.getByRole("alert").filter({hasText:"Decision denied"})).toBeVisible();
 releaseGet!();await page.waitForTimeout(400);expect(posts).toBe(1);await expect(accept).toHaveCount(0);if(status!==200)await expect(page.getByText("Synthetic profile",{exact:true})).toHaveCount(0);
});
