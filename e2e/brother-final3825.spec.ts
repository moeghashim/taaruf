import { test, expect, type Page } from "@playwright/test";
const origin="http://127.0.0.1:3497";
async function harness(page:Page,role="brother",stage:string|undefined="initial",stale=false){
 const posts:Record<string,unknown>[]=[];let current=stage === "missing" ? undefined : stage;let done=false;let closed=false;
 await page.routeWebSocket("**/*",socket=>socket.close());
 await page.route("**/*",async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.origin!==origin)return route.abort();
  if(!url.pathname.startsWith("/api/"))return route.continue();
  if(url.pathname!=="/api/applicant/female-review")return route.fulfill({status:403,json:{error:"Synthetic only"}});
  if(req.method()==="POST"){
   const body=req.postDataJSON();posts.push(body);await new Promise(resolve=>setTimeout(resolve,200));
   if(stale){done=true;return route.fulfill({status:409,json:{error:"This review is unavailable or has changed. Return to your portal and refresh."}});}
   if(body.action==="respond"&&body.decision==="accept")current="final";
   else {done=true;closed=body.approved===false||body.confirmed===false||body.decision==="decline";}
   return route.fulfill({json:{success:true}});
  }
  const row={interestId:"synthetic",role,state:closed?"closed":"in_review",ownAction:done?null:"review",ownActionStage:done?null:current,ownDecision:done?(closed?"declined":"approved"):"pending",canView:true};
  return route.fulfill({json:url.searchParams.has("interestId")?{...row,profile:{label:"Synthetic profile",age:30,imageUrls:[],...(current==="final"?{shareableBio:"Synthetic authorized bio"}:{})}}:{page:[row],isDone:true,continueCursor:""}});
 });return posts;
}
for(const width of [390,1280])for(const approved of [true,false])test("brother distinct initial and final "+width+" approval="+approved,async({page},info)=>{
 await page.setViewportSize({width,height:950});const posts=await harness(page);const token="a".repeat(64);
 await page.goto("/dashboard?femaleReview=synthetic&reviewToken="+token);
 await expect(page.getByRole("button",{name:"Accept",exact:true})).toBeVisible();
 await expect(page.getByText("Synthetic authorized bio",{exact:true})).toHaveCount(0);expect(posts).toHaveLength(0);
 await page.getByRole("button",{name:"Accept",exact:true}).evaluate((button:HTMLButtonElement)=>{button.click();button.click();});
 await expect(page.getByRole("button",{name:"Approve",exact:true})).toBeVisible();
 expect(posts).toEqual([{action:"respond",interestId:"synthetic",decision:"accept",reviewToken:token}]);
 await expect(page.getByText("Synthetic authorized bio",{exact:true})).toBeVisible();
 await expect(page.getByRole("status").filter({hasText:"Initial acceptance recorded"})).toBeVisible();
 await expect(page.getByRole("button",{name:"Accept",exact:true})).toHaveCount(0);
 await expect(page.locator("#contact-details")).toHaveCount(0);
 await expect(page.locator("body")).not.toContainText("Your decision: approved");
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath("final-stage.png"),fullPage:true});
 await page.getByRole("button",{name:approved?"Approve":"Decline",exact:true}).evaluate((button:HTMLButtonElement)=>{button.click();button.click();});
 await expect(page.getByRole("status").filter({hasText:"Your decision is recorded"})).toBeVisible();
 expect(posts).toEqual([{action:"respond",interestId:"synthetic",decision:"accept",reviewToken:token},{action:"brother_final",interestId:"synthetic",approved,reviewToken:token}]);
 await expect(page.getByRole("button",{name:"Approve",exact:true})).toHaveCount(0);await expect(page.locator("#contact-details")).toHaveCount(0);
});
for(const role of ["brother","sister"])for(const approved of [true,false])test(role+" final separate action "+approved,async({page})=>{
 const posts=await harness(page,role,"final");await page.goto("/dashboard?femaleReview=synthetic");
 await page.getByRole("button",{name:approved?(role==="brother"?"Approve":"Confirm interest"):"Decline",exact:true}).click();
 await expect(page.getByRole("status").filter({hasText:"Your decision is recorded"})).toBeVisible();
 expect(posts).toEqual([role==="brother"?{action:"brother_final",interestId:"synthetic",approved}:{action:"confirm",interestId:"synthetic",confirmed:approved}]);
 await expect(page.locator("#contact-details")).toHaveCount(0);
});
for(const role of ["brother","sister"])test(role+" stale decision fails closed without retrying write",async({page})=>{
 const posts=await harness(page,role,"final",true);await page.goto("/dashboard?femaleReview=synthetic");
 await page.getByRole("button",{name:role==="brother"?"Approve":"Confirm interest",exact:true}).click();
 await expect(page.locator("#review-notifications").getByRole("alert")).toContainText("unavailable or has changed");
 await expect(page.getByRole("button",{name:role==="brother"?"Approve":"Confirm interest",exact:true})).toHaveCount(0);
 await page.getByRole("button",{name:"Retry loading review",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Synthetic profile",exact:true})).toBeVisible();expect(posts).toHaveLength(1);
});
test("missing brother stage never guesses final or initial",async({page})=>{
 const posts=await harness(page,"brother","missing");
 await page.goto("/dashboard?femaleReview=synthetic");
 await expect(page.getByRole("status").filter({hasText:"needs to be refreshed"})).toBeVisible();
 await expect(page.getByRole("button",{name:/^(Accept|Approve|Decline)$/})).toHaveCount(0);expect(posts).toHaveLength(0);
});
