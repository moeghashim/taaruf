import { test, expect } from "@playwright/test";
const long = "Kindness, shared faith and thoughtful communication.\nA second paragraph preserved in full. " + "A meaningful requirement with details. ".repeat(12) + "x".repeat(100);
for (const width of [1280, 390, 320]) for (const role of ["brother", "sister"]) {
  test(role + " review layout and photo revocation at " + width, async ({page}, info) => {
    await page.setViewportSize({width, height: 950});
    let images = ["/fixture-portrait.svg", "/fixture-landscape.svg"];
    let empty = false; let blocked = false;
    const state = role === "brother" ? "awaiting_brother_review" : "awaiting_sister_confirmation";
    const posts: unknown[] = [];
    await page.routeWebSocket("**/*", ws => ws.close());
    await page.route("**/*", route => {
      const u = new URL(route.request().url());
      if (u.origin !== new URL(process.env.PREVIEW_URL || "http://127.0.0.1:3192").origin) return route.abort();
      if (u.pathname.startsWith("/fixture-")) return route.fulfill({contentType:"image/svg+xml",body:'<svg xmlns="http://www.w3.org/2000/svg" width="'+(u.pathname.includes("portrait")?600:900)+'" height="'+(u.pathname.includes("portrait")?900:600)+'"><rect width="100%" height="100%" fill="#c8bbaa"/><text x="20" y="60" font-size="24">Synthetic photo fixture</text></svg>'});
      if (!u.pathname.startsWith("/api/")) return route.continue();
      if (route.request().method() !== "GET") { posts.push(route.request().postDataJSON()); return route.fulfill({json:{success:true}}); }
      if (u.pathname === "/api/applicant/female-review") return route.fulfill({status:blocked && u.searchParams.has("interestId")?403:200,json:u.searchParams.has("interestId") ? blocked ? {error:"Review unavailable."} : {role,state,profile:{label:"Applicant #999",age:30,education:"Bachelor’s",job:"Engineer",ethnicity:"Synthetic",spouseRequirement1:empty?"":long,spouseRequirement2:empty?"":"Respect",imageUrls:images}} : {page:[{interestId:"fixture",role,state}],isDone:true,continueCursor:""}});
      return route.fulfill({status:400,json:{error:"Synthetic fixture only"}});
    });
    await page.goto("/dashboard?femaleReview=fixture");
    const review=page.getByRole("region",{name:"Selected profile review",exact:true});
    await expect(review.getByRole("heading",{name:"Requirements",exact:true})).toBeVisible();
    await expect(review.locator(".profile-requirements li").first()).toHaveText(long);
    const facts=review.locator(".fact");
    const style=await facts.evaluateAll(rows=>rows.slice(0,2).map(row=>[".k",".v"].map(sel=>{const s=getComputedStyle(row.querySelector(sel)!);return [s.fontSize,s.fontFamily,s.fontWeight];})));
    expect(style[0]).toEqual(style[1]);
    for (const img of await review.locator("img").all()) {
      await expect(img).toBeVisible();
      const geometry=await img.evaluate(el=>{const i=el as HTMLImageElement;return {w:i.width,h:i.height,nw:i.naturalWidth,nh:i.naturalHeight};});
      expect(geometry.nw).toBeGreaterThan(0); expect(Math.abs(geometry.w/geometry.h-geometry.nw/geometry.nh)).toBeLessThan(.01);
      expect(geometry.w).toBeGreaterThan(width===1280?500:180);
    }
    expect(await page.locator("body").evaluate(el=>el.scrollWidth<=innerWidth)).toBe(true);
    await review.screenshot({path:info.outputPath("review.png")});
    await expect(review.getByRole("button",{name:role==="brother"?"Accept":"Confirm mutual interest",exact:true})).toBeVisible();
    await expect(review.locator(".contact-box")).toHaveCount(0); expect(posts).toEqual([]);
    images=[]; empty=true;
    await page.getByRole("button",{name:"Refresh",exact:true}).click();
    await expect(review.locator("img")).toHaveCount(0);
    await expect(review.getByText("No requirements provided.")).toBeVisible();
    await page.reload(); // denied/no-photo initial snapshot, not just revocation refresh
    await expect(review.locator("img")).toHaveCount(0);
    blocked=true; await page.getByRole("button",{name:"Refresh",exact:true}).click();
    await expect(page.getByRole("alert").filter({hasText:"Review unavailable."})).toBeVisible();
    await expect(review.locator(".fact-list")).toHaveCount(0);
    await expect(review.getByRole("button",{name:"Accept",exact:true})).toHaveCount(0);
  });
}

for (const width of [1280,390,320]) for (const surface of ["share","me"]) test(surface+" full profile at "+width,async({page},info)=>{
  await page.setViewportSize({width,height:950});
  let allowed=true;
  const profile={label:"Applicant #999",age:30,gender:"female",education:"Bachelor’s",job:"Engineer",ethnicity:"Synthetic",fullProfileVisible:true,spouseRequirement1:long,spouseRequirement2:"Respect",imageUrls:["/fixture-landscape.svg"]};
  await page.routeWebSocket("**/*",ws=>ws.close());
  await page.route("**/*",route=>{
    const u=new URL(route.request().url());
    if(u.origin!==new URL(process.env.PREVIEW_URL||"http://127.0.0.1:3192").origin)return route.abort();
    if(u.pathname==="/fixture-landscape.svg")return route.fulfill({contentType:"image/svg+xml",body:'<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#c8bbaa"/></svg>'});
    if(!u.pathname.startsWith("/api/"))return route.continue();
    if(u.pathname.startsWith("/api/share/"))return route.fulfill({json:{share:{includeImages:allowed,status:"viewed",owner:profile,recipient:{name:"Synthetic recipient"}}}});
    if(u.pathname==="/api/applicant/me")return route.fulfill({json:{applicant:{name:"Synthetic",gender:"male",applicantNumber:1,profileCompletionStatus:"completed"},inbound:[{interestId:"fixture",direction:"inbound",status:"accepted",flowStatus:"awaiting_final_approval",counterparty:{...profile,imageUrls:allowed?profile.imageUrls:[]}}],outbound:[],privateDocumented:[],canSubmitInterest:false,interestSubmissions:[]}});
    if(u.pathname==="/api/applicant/female-review")return route.fulfill({json:{page:[],isDone:true,continueCursor:""}});
    if(u.pathname==="/api/applicant/events")return route.fulfill({json:{upcoming:[],history:[]}});
    return route.fulfill({status:400,json:{error:"Synthetic fixture only"}});
  });
  await page.goto(surface==="share"?"/share/fixture":"/me");
  const target=page.locator(surface==="share"?".applicant-share":".interest-detail-panel").filter({has:page.locator(".profile-requirements")});
  await expect(target.getByRole("heading",{name:"Requirements",exact:true})).toBeVisible();
  await expect(target.locator(".profile-requirements li").first()).toHaveText(long);
  await expect(target.locator("img")).toHaveCount(1);
  const image=target.locator("img");await expect(image).toBeVisible();
  await expect.poll(()=>image.evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBe(900);
  const box=await image.boundingBox();expect(Math.abs(box!.width/box!.height-1.5)).toBeLessThan(.01);
  expect(await page.locator("body").evaluate(el=>el.scrollWidth<=innerWidth)).toBe(true);
  await target.screenshot({path:info.outputPath("profile.png")});
  allowed=false;await page.reload();await expect(target.locator("img")).toHaveCount(0);
});
