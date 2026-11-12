import { test, expect } from "@playwright/test";
for (const width of [320,390,1280]) for (const gender of ["male","female"]) for (const surface of ["inline","standalone","regular"]) for (const direction of (surface === "regular" ? ["inbound", "outbound"] : [gender === "male" ? "inbound" : "outbound"])) for (const state of ["approved", "declined", "pending", "paused", "expired", "contacts"]) test(width+" "+gender+" "+surface+" "+direction+" "+state,async({page},info)=>{
 await page.setViewportSize({width,height:950});
 const role=gender==="male"?"brother":"sister";
 const ownDecision = ["declined", "pending"].includes(state) ? state : "approved";
 const final = ownDecision !== "pending", notice = ownDecision === "approved" && !["expired", "contacts"].includes(state) && (surface === "regular" || state !== "paused");
 const row={interestId:"fixture",role,state:state === "expired" ? "expired" : state === "contacts" ? "contacts_released" : "in_review",ownDecision,paused:state === "paused",reviewExpired:state === "expired",canView:true};
 const profile={label:"Applicant #999",gender:gender==="male"?"female":"male",age:30,education:"Bachelor’s",job:"Engineer",ethnicity:"Synthetic",shareableBio:"I value kindness, shared faith and thoughtful communication. I enjoy spending time with family and learning new things.",spouseRequirement1:"Kindness and shared values",imageUrls:[],fullProfileVisible:true,...(state === "contacts" ? {email:"fixture@example.invalid",phone:"+15555550199"} : {})};
 const interest={interestId:"fixture",direction,status:state === "expired" ? "expired" : "active",flowStatus:state === "contacts" ? "contact_shared" : "in_progress",ownFinalApproval:ownDecision,paused:state === "paused",canRespond:false,canFinalApprove:false,canWithdraw:false,contactSharedAt:state === "contacts" ? 123 : null,counterparty:profile};
 await page.routeWebSocket("**/*",s=>s.close());
 await page.route("**/*",route=>{const req=route.request(),u=new URL(req.url());if(u.origin!=="http://127.0.0.1:3984")return route.abort();if(!u.pathname.startsWith("/api/"))return route.continue();if(req.method()!=="GET")return route.fulfill({status:403,json:{error:"Read only synthetic test"}});
 const json=u.pathname.endsWith("/me")?{applicant:{name:"Synthetic applicant",gender,status:"approved",profileCompletionStatus:"completed"},inbound:surface==="regular"&&direction==="inbound"?[interest]:[],outbound:surface==="regular"&&direction==="outbound"?[interest]:[],privateDocumented:[],canSubmitInterest:false,interestSubmissionLimit:3,interestSubmissions:[]}
 :u.pathname.endsWith("/profile")?{registration:{name:"Synthetic applicant",gender,imageUrls:[],imageStorageIds:[],interestSubmissionNumbers:[]}}
 :u.pathname.endsWith("/events")?{upcoming:[],history:[],eligibleInterestEvents:[]}
 :u.pathname.endsWith("/matchmaker")?{matches:[],optedIn:true}
 :u.pathname.endsWith("/female-review")?u.searchParams.has("interestId")?{...row,profile}:{page:surface==="regular"?[]:[row],isDone:true,continueCursor:""}:{};
 return route.fulfill({json});});
 await page.goto(surface==="standalone"?"/dashboard?femaleReview=fixture":surface==="regular"?"/me#"+direction+"-interests":"/me?femaleReview=fixture#"+direction+"-interests");
 const panel=surface==="standalone"?page.locator(".selected-profile-review"):page.locator("#"+direction+"-interests .interest-detail-panel");
 await expect(panel.locator(".bio-box")).toBeVisible();await expect(panel.locator(".review-decision")).toHaveCount(final ? 1 : 0);await expect(panel.locator(".review-decision .notice")).toHaveCount(notice ? 1 : 0);
 if (final) { const bio=await panel.locator(".bio-box").boundingBox(),decision=await panel.locator(".review-decision").boundingBox();expect(decision!.y).toBeGreaterThanOrEqual(bio!.y+bio!.height); }
 await expect(page.locator(".review-decision:visible")).toHaveCount(final ? 1 : 0);await expect(panel.locator(".contact-box")).toHaveCount(state === "contacts" ? 1 : 0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 if (final) { const fonts=await panel.evaluate(el=>[el.querySelector(".bio-box p"),el.querySelector(".review-decision-label")].map(e=>getComputedStyle(e!).fontFamily));expect(fonts[0]).toEqual(fonts[1]); }
 await panel.screenshot({path:info.outputPath("review.png")});
});
