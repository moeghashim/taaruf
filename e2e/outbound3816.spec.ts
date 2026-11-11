import {expect,test} from "@playwright/test";
const origin=process.env.PORTAL_BASE||"http://127.0.0.1:3816";
test.use({baseURL:origin,serviceWorkers:"block"});
for(const width of [390,1280]) test("sharing categories, counts, failure and closure "+width,async({page},info)=>{
 await page.setViewportSize({width,height:900});
 let shared=false,closed=false,fail=false; const writes:string[]=[];
 const interest=(interestId:string)=>({interestId,femaleWorkflow:true,direction:"private",status:"in_progress",flowStatus:"in_progress",visibility:"internal_only",canRespond:false,canFinalApprove:false,canWithdraw:false,ownFinalApproval:"pending",contactSharedAt:null,senderPhotoConsent:"no",senderPhotoConsentRevokedAt:null,photoDecision:"pending",counterparty:{label:"Synthetic Brother",gender:"male",age:30,imageUrls:[],fullProfileVisible:true}});
 await page.routeWebSocket("**/*",s=>s.close());
 await page.route("**/*",route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.origin!==origin)return route.abort();
  if(!url.pathname.startsWith("/api/"))return route.continue();
  if(req.method()!=="GET"){writes.push(url.pathname);return route.fulfill({status:403,json:{error:"Blocked"}});}
  const json=url.pathname.endsWith("/me")?{applicant:{name:"Synthetic Sister",gender:"female",status:"approved",profileCompletionStatus:"completed"},inbound:[],outbound:[],privateDocumented:closed?[interest("other")]:[interest("shared"),interest("other")],interestSubmissions:[],canSubmitInterest:false,interestSubmissionLimit:3}
   :url.pathname.endsWith("/profile")?{registration:{name:"Synthetic Sister",gender:"female",imageUrls:[],imageStorageIds:[],interestSubmissionNumbers:[]}}
   :url.pathname.endsWith("/events")?{upcoming:[],history:[],eligibleInterestEvents:[]}
   :url.pathname.endsWith("/matchmaker")?{matches:[],optedIn:true}
   :url.pathname.endsWith("/female-review")?{page:[{interestId:"shared",role:"sister",state:closed?"closed":"in_review",canView:shared&&!closed,ownDecision:"pending",ownAction:null},{interestId:"independent",role:"sister",state:"in_review",canView:true}],isDone:true,continueCursor:""}
   :{canSubmitInterest:false};
  return route.fulfill({status:fail&&url.pathname.endsWith("/female-review")?503:200,json});
 });
 await page.goto("/me#applicant-interests");
 const outbound=page.locator("#outbound-interests"),priv=page.locator("#private-documented-interests");
 await expect(priv.locator("[data-interest-id]")).toHaveCount(2);await expect(outbound.locator("[data-interest-id]")).toHaveCount(0);
 shared=true;await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
 await expect(outbound.locator('[data-interest-id="shared"]')).toHaveCount(1);await expect(priv.locator("[data-interest-id]")).toHaveCount(1);
 await expect(page.locator('[data-connection-notice="shared"] h2')).toHaveText("You Have Sent An Interest");
 await expect(outbound.locator(".panel-head")).toContainText("1 item");
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath("shared-"+width+".png"),fullPage:true});
 fail=true;await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
 await expect(page.getByText("Unable to load some interest updates.",{exact:false})).toBeVisible();
 await expect(outbound.locator('[data-interest-id="shared"]')).toHaveCount(1);
 fail=false;closed=true;await page.evaluate(()=>window.dispatchEvent(new Event("applicant-interest-updated")));
 await expect(page.locator('[data-interest-id="shared"]')).toHaveCount(0);await expect(priv.locator("[data-interest-id]")).toHaveCount(1);
 expect(writes).toEqual([]);
});
