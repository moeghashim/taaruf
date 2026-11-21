import {expect,test,type Page} from "@playwright/test";
const origin=process.env.PORTAL_BASE||"http://127.0.0.1:6542";
test.use({baseURL:origin,serviceWorkers:"block", channel: "chrome"});
type Mode="decline"|"accept"|"final"|"final-decline"|"stale"|"failure"|"refresh-failure"|"selection-race";
async function mock(page:Page,gender:string,mode:Mode){
 const state={writes:[] as unknown[],gets:[] as string[],saved:false};
 const row=()=>({interestId:"one",direction:"inbound",status:"active",flowStatus:mode.startsWith("final")?"bio_review":"awaiting_inbound_response",visibility:"admin_actionable",canRespond:!mode.startsWith("final"),canFinalApprove:mode.startsWith("final"),canWithdraw:false,ownFinalApproval:"pending",contactSharedAt:null,counterparty:{label:"Synthetic counterpart",gender:gender==="male"?"female":"male",age:30,imageUrls:[],fullProfileVisible:true,shareableBio:"Synthetic private detail"}});
 await page.routeWebSocket("**/*",s=>s.close());
 await page.route("**/*",async route=>{const req=route.request(),url=new URL(req.url());if(url.origin!==origin)return route.abort();if(!url.pathname.startsWith("/api/"))return route.continue();
 if(req.method()!=="GET"){
   if(url.pathname!=="/api/applicant/interests")return route.abort();state.writes.push(req.postDataJSON());
   if(mode==="failure")return route.fulfill({status:500,json:{error:"Synthetic action rejected"}});
   if(mode==="selection-race"){await page.evaluate(()=>{history.replaceState({},"","/me?connection=newer#applicant-interests");window.dispatchEvent(new PopStateEvent("popstate"));});}
   state.saved=true;return route.fulfill({json:{success:true,message:"Your decision has been recorded."}});
 }
 state.gets.push(url.pathname+url.search);
 if(url.pathname.endsWith("/me")){
   if(state.saved&&mode==="refresh-failure")return route.fulfill({status:500,json:{error:"Synthetic refresh failure"}});
   if(url.searchParams.has("connection")&&(mode==="stale"||(state.saved&&["decline","final-decline"].includes(mode))))return route.fulfill({status:404,json:{error:"Connection unavailable."}});
   return route.fulfill({json:{applicant:{name:"Synthetic Applicant",gender,status:"approved",profileCompletionStatus:"completed"},inbound:mode==="stale"||state.saved&&["decline","final-decline","refresh-failure"].includes(mode)?[]:[row()],outbound:[],privateDocumented:[],canSubmitInterest:false,interestSubmissionLimit:3,interestSubmissions:[]}});
 }
 const json=url.pathname.endsWith("/profile")?{registration:{name:"Synthetic Applicant",gender,imageUrls:[],imageStorageIds:[],interestSubmissionNumbers:[]}}:url.pathname.endsWith("/events")?{upcoming:[],history:[],eligibleInterestEvents:[]}:url.pathname.endsWith("/matchmaker")?{matches:[],optedIn:true}:url.pathname.endsWith("/female-review")?{page:[],isDone:true,continueCursor:""}:{canSubmitInterest:false};return route.fulfill({json});});return state;
}
for(const gender of ["male","female"])for(const width of [390,1280])for(const mode of ["decline","accept","final","final-decline","stale","failure","refresh-failure","selection-race"] as Mode[])test(gender+" "+width+" "+mode,async({page},info)=>{
 await page.setViewportSize({width,height:950});const state=await mock(page,gender,mode);await page.goto('/me?connection=one#applicant-interests');
 if(mode==="stale"){await expect(page.getByText("That connection is no longer available. Your other interests are shown below.")).toBeVisible();expect(new URL(page.url()).searchParams.has("connection")).toBe(false);await expect(page.getByText("Synthetic private detail")).toHaveCount(0);expect(state.writes).toEqual([]);}
 else {const label=mode==="accept"?"Accept":mode==="final"?"Final Approval":mode==="final-decline"?"Decline After Bio":"Decline";await page.getByRole("button",{name:label,exact:true}).click();
 if(mode==="failure"){await expect(page.getByText("Synthetic action rejected")).toBeVisible();expect(new URL(page.url()).searchParams.get("connection")).toBe("one");await expect(page.getByText("Your decision has been recorded.")).toHaveCount(0);}
 else if(mode==="refresh-failure"){await expect(page.getByText(/Your decision was saved, but the dashboard could not refresh/)).toBeVisible();await expect(page.getByText("Synthetic private detail")).toHaveCount(0);await expect(page.getByRole("button",{name:"Reload dashboard"})).toBeVisible();}
 else {await expect(page.getByText("Your decision has been recorded.")).toBeVisible();expect(new URL(page.url()).searchParams.get("connection")).toBe(mode==="selection-race"?"newer":["accept","final"].includes(mode)?"one":null);await expect(page.getByText("Connection unavailable.",{exact:true})).toHaveCount(0);}
 expect(state.writes).toHaveLength(1);
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 if(width===390&&gender==="female"&&["decline","refresh-failure","stale"].includes(mode))await page.screenshot({path:info.outputPath("result.png"),fullPage:true});
});
