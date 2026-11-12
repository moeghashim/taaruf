import { expect, test } from "@playwright/test";
const origin="http://127.0.0.1:3861";
for(const width of [390,1280])for(const decision of ["pending","approved","declined","before"])test(width+" sister "+decision,async({page},info)=>{
 await page.setViewportSize({width,height:950});const writes:unknown[]=[];
 const row=(id:string)=>({interestId:id,role:"sister",state:decision==="declined"?"closed":"in_review",canView:decision!=="declined",ownAction:decision==="pending"?"review":null,ownActionStage:"final",ownDecision:decision==="before"?"pending":decision});
 const interest=(id:string,inbound=false)=>({interestId:id,femaleWorkflow:!inbound,direction:inbound?"inbound":"private",status:"active",flowStatus:"in_progress",canRespond:inbound,canFinalApprove:false,canWithdraw:false,ownFinalApproval:"pending",contactSharedAt:null,counterparty:{label:"Same Brother "+id,gender:"male",age:30,imageUrls:[],fullProfileVisible:true}});
 await page.routeWebSocket("**/*",s=>s.close());
 await page.route("**/*",route=>{const req=route.request(),url=new URL(req.url());if(url.origin!==origin)return route.abort();if(!url.pathname.startsWith("/api/"))return route.continue();if(req.method()!=="GET"){writes.push(req.postDataJSON());return route.fulfill({status:403,json:{error:"Synthetic read only"}});}
 const id=url.searchParams.get("interestId");
 const json=url.pathname.endsWith("/me")?{applicant:{name:"Synthetic Sister",gender:"female",status:"approved",profileCompletionStatus:"completed"},inbound:[interest("reciprocal",true)],outbound:[],privateDocumented:decision==="declined"?[]:[interest("first"),interest("second")],canSubmitInterest:false,interestSubmissionLimit:3,interestSubmissions:[]}
 :url.pathname.endsWith("/profile")?{registration:{name:"Synthetic Sister",gender:"female",imageUrls:[],imageStorageIds:[],interestSubmissionNumbers:[]}}
 :url.pathname.endsWith("/events")?{upcoming:[],history:[],eligibleInterestEvents:[]}
 :url.pathname.endsWith("/matchmaker")?{matches:[],optedIn:true}
 :url.pathname.endsWith("/female-review")?id?{...row(id),profile:decision==="declined"?undefined:{label:"Review "+id,age:30,imageUrls:[],...(decision!=="before"?{shareableBio:"Authorized bio "+id}:{})}}:{page:[row("first"),row("second")],isDone:true,continueCursor:""}
 :{canSubmitInterest:false};return route.fulfill({json});});
 await page.goto("/me?femaleReview=second#inbound-interests");
 const inbound=page.locator("#inbound-interests"),outbound=page.locator("#outbound-interests"),review=outbound.locator("#inline-selected-review");
 await expect(review).toBeVisible();await expect(inbound.locator("#review-notifications")).toHaveCount(0);
 await expect(inbound.locator(".panel-head")).toContainText("1 item");await expect(inbound.locator('[data-interest-id="reciprocal"]')).toBeVisible();
 await expect(outbound.getByText("Nothing to show right now.",{exact:true})).toHaveCount(0);
 if(decision!=="declined"){
 await expect(review.getByRole("heading",{name:"Review second",exact:true})).toBeVisible();await expect(review).toBeFocused();await expect(outbound.locator(".panel-head")).toContainText("2 items");
 await expect(review.getByRole("button",{name:"Confirm interest",exact:true})).toHaveCount(decision==="pending"?1:0);
 await expect(review.getByText("Authorized bio second",{exact:true})).toHaveCount(decision==="before"?0:1);
 if(decision==="approved")await expect(outbound.getByText("Your decision: approved.",{exact:true})).toBeVisible();
 await outbound.locator('[data-interest-id="first"]').click();await expect(review.getByRole("heading",{name:"Review first",exact:true})).toBeVisible();await expect(page).toHaveURL(/femaleReview=first#outbound-interests/);
 await page.goBack();await expect(review.getByRole("heading",{name:"Review second",exact:true})).toBeVisible();
 }else {await expect(outbound.getByText("Your decision: declined.",{exact:true})).toBeVisible();await expect(outbound.getByText("Your decision: declined.",{exact:true})).toHaveCount(1);await expect(review.locator("button")).toHaveCount(0);await expect(review.locator("img")).toHaveCount(0);await expect(review.getByRole("heading",{name:/Review (first|second)/})).toHaveCount(0);await expect(review.getByText(/Authorized bio/)).toHaveCount(0);}
 await expect(review.locator("#contact-details")).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await outbound.screenshot({path:info.outputPath("outbound.png")});expect(writes).toEqual([]);
});
