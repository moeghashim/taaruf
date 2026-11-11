import { test, expect } from "@playwright/test";
for (const role of ["brother", "sister"]) for (const touch of [false, true]) for (const decline of [false, true]) {
 test(role + " first decision survives focus refresh " + touch + " decline=" + decline, async ({browser}, info) => {
  const context = await browser.newContext({baseURL:"http://127.0.0.1:3226",hasTouch:touch,viewport:{width:touch?390:1280,height:950},serviceWorkers:"block"});
  const page=await context.newPage(); let posts=0; let gets=0; let state=role === "brother" ? "awaiting_brother_review" : "awaiting_sister_confirmation";
  await page.routeWebSocket("**/*",ws=>ws.close());
  await page.route("**/*",async route=>{
   const u=new URL(route.request().url()); if(u.origin!=="http://127.0.0.1:3226") return route.abort();
   if(!u.pathname.startsWith("/api/")) return route.continue();
   if(u.pathname!=="/api/applicant/female-review") return route.fulfill({status:400,json:{error:"synthetic only"}});
   if(route.request().method()==="POST") {posts++; await new Promise(r=>setTimeout(r,500));state=decline?"declined":"pending_admin_approval";return route.fulfill({json:{success:true}});}
   gets++;await new Promise(r=>setTimeout(r,350));const review={interestId:"synthetic",role,state};return route.fulfill({json:u.searchParams.has("interestId")?{...review,profile:{label:"Synthetic profile",age:30,imageUrls:[]}}:{page:[review],isDone:true,continueCursor:""}});
  });
  await page.goto("/dashboard?femaleReview=synthetic");
  const button=page.getByRole("button",{name:decline?"Decline":role==="brother"?"Accept":"Confirm mutual interest",exact:true}); await expect(button).toBeVisible(); await page.waitForTimeout(700);
  const box=await button.boundingBox();expect(box).not.toBeNull();
  // Native focus can arrive between pointer-down and click when returning to the window.
  if (touch) {
    const cdp=await context.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:box!.x+box!.width/2,y:box!.y+box!.height/2}]});
    await page.evaluate(()=>window.dispatchEvent(new Event("focus")));await page.waitForTimeout(60);
    await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
  } else {
    await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2);await page.mouse.down();
    await page.evaluate(()=>window.dispatchEvent(new Event("focus")));await page.waitForTimeout(60);await page.mouse.up();
  }
  await expect(page.getByRole("status").filter({hasText:"Recording your decision"})).toBeVisible();
  await page.waitForTimeout(1100);
  await info.attach("counts",{body:JSON.stringify({posts,gets}),contentType:"application/json"});
  expect(posts,"one explicit decision must produce exactly one POST").toBe(1);
  await expect(page.getByRole("status").filter({hasText:"Your decision is recorded"})).toBeVisible();
  await context.close();
 });
}
