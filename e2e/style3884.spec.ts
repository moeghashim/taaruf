import { test, expect } from "@playwright/test";
for (const width of [320,390,1280]) for (const gender of ["male","female"]) for (const surface of ["inline","standalone","regular"]) test(width+" "+gender+" "+surface,async({page},info)=>{
 await page.setViewportSize({width,height:950});
 const role=gender==="male"?"brother":"sister", direction=gender==="male"?"inbound":"outbound";
 const row={interestId:"fixture",role,state:"in_review",ownDecision:"approved",canView:true};
 const profile={label:"Applicant #999",gender:gender==="male"?"female":"male",age:30,education:"Bachelor’s",job:"Engineer",ethnicity:"Synthetic",shareableBio:"I value kindness, shared faith and thoughtful communication. I enjoy spending time with family and learning new things.",spouseRequirement1:"Kindness and shared values",imageUrls:[],fullProfileVisible:true};
 const interest={interestId:"fixture",direction,status:"active",flowStatus:"in_progress",ownFinalApproval:"approved",canRespond:false,canFinalApprove:false,canWithdraw:false,contactSharedAt:null,counterparty:profile};
 await page.routeWebSocket("**/*",s=>s.close());
 await page.route("**/*",route=>{const req=route.request(),u=new URL(req.url());if(u.origin!=="http://127.0.0.1:3884")return route.abort();if(!u.pathname.startsWith("/api/"))return route.continue();if(req.method()!=="GET")return route.fulfill({status:403,json:{error:"Read only synthetic test"}});
 const json=u.pathname.endsWith("/me")?{applicant:{name:"Synthetic applicant",gender,status:"approved",profileCompletionStatus:"completed"},inbound:surface==="regular"&&direction==="inbound"?[interest]:[],outbound:surface==="regular"&&direction==="outbound"?[interest]:[],privateDocumented:[],canSubmitInterest:false,interestSubmissionLimit:3,interestSubmissions:[]}
 :u.pathname.endsWith("/profile")?{registration:{name:"Synthetic applicant",gender,imageUrls:[],imageStorageIds:[],interestSubmissionNumbers:[]}}
 :u.pathname.endsWith("/events")?{upcoming:[],history:[],eligibleInterestEvents:[]}
 :u.pathname.endsWith("/matchmaker")?{matches:[],optedIn:true}
 :u.pathname.endsWith("/female-review")?u.searchParams.has("interestId")?{...row,profile}:{page:surface==="regular"?[]:[row],isDone:true,continueCursor:""}:{};
 return route.fulfill({json});});
 await page.goto(surface==="standalone"?"/dashboard?femaleReview=fixture":surface==="regular"?"/me#"+direction+"-interests":"/me?femaleReview=fixture#"+direction+"-interests");
 const panel=surface==="standalone"?page.locator(".selected-profile-review"):page.locator("#"+direction+"-interests .interest-detail-panel");
 await expect(panel.locator(".bio-box")).toBeVisible();await expect(panel.locator(".review-decision")).toHaveCount(1);await expect(panel.locator(".review-decision .notice")).toHaveCount(1);
 const bio=await panel.locator(".bio-box").boundingBox(),decision=await panel.locator(".review-decision").boundingBox();expect(decision!.y).toBeGreaterThanOrEqual(bio!.y+bio!.height);
 await expect(page.locator(".review-decision:visible")).toHaveCount(1);await expect(panel.locator(".contact-box")).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const fonts=await panel.evaluate(el=>[el.querySelector(".bio-box p"),el.querySelector(".review-decision-label")].map(e=>getComputedStyle(e!).fontFamily));expect(fonts[0]).toEqual(fonts[1]);
 await panel.screenshot({path:info.outputPath("review.png")});
});
