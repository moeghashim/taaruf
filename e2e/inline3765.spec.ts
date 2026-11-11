import { expect, test, type Locator, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
// Production renderer; all API calls intercepted, non-GET requests blocked.
const origin = process.env.PORTAL_BASE || "http://127.0.0.1:3765";
test.use({baseURL:origin,serviceWorkers:"block"});
const portrait = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect width="480" height="360" fill="#d9e4df"/><text x="100" y="180" font-size="24">Synthetic photo</text></svg>');
const profile = {label:"Applicant 901",age:30,education:"bachelors",job:"Engineer",ethnicity:"Synthetic ethnicity",spouseRequirement1:"Kindness and shared values.\nFull answers remain visible.",spouseRequirement2:"Clear communication",shareableBio:"Synthetic authorized bio.\nSecond paragraph.",imageUrls:[portrait]};
async function mock(page: Page, role: "brother" | "sister", options: {photos?:boolean;denied?:boolean;contacts?:boolean} = {}) {
 const writes:string[]=[]; const unexpected:string[]=[];
 const details={...profile,imageUrls:options.photos===false?[]:profile.imageUrls,...(options.contacts?{email:"synthetic@example.invalid",phone:"000-000-0000"}:{})};
 const row={interestId:"review",role,state:options.contacts?"contacts_released":"in_review",ownAction:options.contacts?null:"review",ownDecision:"pending",canView:true};
 await page.routeWebSocket("**/*",socket=>socket.close());
 await page.route("**/*",route=>{
  const req=route.request();const url=new URL(req.url());
  if(url.origin!==origin) return route.abort();
  if(!url.pathname.startsWith("/api/"))return route.continue();
  if(req.method()!=="GET"){writes.push(url.pathname);return route.fulfill({status:403,json:{error:"Read only"}});}
  const headers={"cache-control":"no-store"};
  if(url.pathname==="/api/applicant/me")return route.fulfill({headers,json:{applicant:{name:"Synthetic Applicant",gender:role==="brother"?"male":"female",status:"approved",applicantNumber:999,profileCompletionStatus:"completed"},inbound:[],outbound:[],privateDocumented:role==="sister"?[{interestId:"private",direction:"private",status:"active",flowStatus:"pending_admin_review",visibility:"private",canRespond:false,canFinalApprove:false,canWithdraw:false,counterparty:{...details,gender:"male",fullProfileVisible:true}}]:[],canSubmitInterest:false,interestSubmissions:[],interestSubmissionLimit:3}});
  if(url.pathname==="/api/applicant/profile")return route.fulfill({headers,json:{registration:{name:"Synthetic Applicant",gender:role==="brother"?"male":"female",imageUrls:[],imageStorageIds:[],interestSubmissionNumbers:[]}}});
  if(url.pathname==="/api/applicant/interest-eligibility")return route.fulfill({headers,json:{canSubmitInterest:false}});
  if(url.pathname==="/api/applicant/events")return route.fulfill({headers,json:{upcoming:[],history:[],eligibleInterestEvents:[]}});
  if(url.pathname==="/api/applicant/matchmaker")return route.fulfill({headers,json:{optedIn:true,matches:[]}});
  if(url.pathname==="/api/applicant/female-review")return route.fulfill({headers,status:url.searchParams.has("interestId")&&options.denied?403:200,json:url.searchParams.has("interestId")?(options.denied?{error:"Review unavailable"}:{...row,profile:details}):{page:[row],isDone:true,continueCursor:""}});
  unexpected.push(url.pathname);return route.fulfill({status:404,json:{error:"Blocked"}});
 });
 return {writes,unexpected};
}
async function styles(panel:Locator){
 const selectors=[".interest-detail-head h3",".profile-review-box",".profile-review-box h4",".fact",".fact .k",".fact .v",".profile-requirements",".profile-requirements li",".photo-grid",".photo-card",".photo-card img",".bio-box",".bio-box h4",".bio-box p"];
 return panel.evaluate((el,selectors)=>Object.fromEntries(selectors.map(selector=>{const node=el.querySelector(selector)!;const s=getComputedStyle(node);return [selector,Object.fromEntries(["fontFamily","fontSize","fontWeight","lineHeight","letterSpacing","color","backgroundColor","padding","gap","borderRadius","border","objectFit","marginTop","marginBottom"].map(k=>[k,s[k as keyof CSSStyleDeclaration]]))];})),selectors);
}
for(const width of [390,1280]) test("inline matches actual Private Documented Interests "+width,async({browser},info)=>{
 const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:"block"});
 const reference=await context.newPage();const refState=await mock(reference,"sister");await reference.goto(origin+"/me#applicant-interests");
 const ref=reference.locator("#private-documented-interests .interest-detail-panel");await expect(ref.getByText("Profile details",{exact:true})).toBeVisible();
 const page=await context.newPage();const state=await mock(page,"brother");await page.goto(origin+"/me#applicant-interests");await page.getByRole("region",{name:"Received interest updates",exact:true}).getByRole("link").click();
 const panel=page.locator("#inline-selected-review");await expect(panel).toBeFocused();await expect(panel.getByRole("button",{name:"Accept",exact:true})).toBeVisible();
 expect(await styles(panel)).toEqual(await styles(ref));
 const computed = JSON.stringify({inline:await styles(panel),reference:await styles(ref)},null,2);
 await writeFile(info.outputPath("computed-parity.json"),computed);
 await info.attach("computed-parity",{body:computed,contentType:"application/json"});
 for(const [name,p,card] of [["reference",reference,ref],["inline",page,panel]] as const){
  expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const img=card.locator(".photo-card img");await expect(img).toBeVisible();expect(await img.evaluate((n:HTMLImageElement)=>Math.abs(n.clientWidth/n.clientHeight-n.naturalWidth/n.naturalHeight)<0.02)).toBe(true);
  await card.screenshot({path:info.outputPath(name+"-"+width+".png")});
 }
 expect((await panel.boundingBox())!.width).toBeGreaterThan(width===1280?680:250);
 expect(state.writes.concat(refState.writes)).toEqual([]);expect(state.unexpected.concat(refState.unexpected)).toEqual([]);
 await page.getByRole("link",{name:"Back to applicant interests"}).click();await expect(panel).toHaveCount(0);
 await context.close();
});
for(const width of [390,1280])for(const mode of ["no-photos","denied","contacts","standalone"] as const)test(mode+" preserves access "+width,async({page})=>{
 await page.setViewportSize({width,height:1000});const state=await mock(page,"brother",{photos:mode!=="no-photos",denied:mode==="denied",contacts:mode==="contacts"});
 await page.goto((mode==="standalone"?"/dashboard":"/me")+"?femaleReview=review#inbound-interests");
 const panel=page.getByRole("region",{name:"Selected profile review",exact:true});
 if(mode==="denied"){await expect(page.getByRole("alert").filter({hasText:"Review unavailable"})).toBeVisible();await expect(panel.locator(".profile-review-box")).toHaveCount(0);await expect(panel.getByRole("button",{name:"Accept",exact:true})).toHaveCount(0);}
 else {await expect(panel).toContainText(profile.shareableBio);if(mode==="no-photos")await expect(panel.locator("img")).toHaveCount(0);if(mode==="contacts")await expect(panel.locator("#contact-details")).toContainText("synthetic@example.invalid");else await expect(panel.locator("#contact-details")).toHaveCount(0);if(mode==="standalone"){await expect(panel).toHaveClass("selected-profile-review");await expect(panel.locator(".profile-review-photos img")).toHaveCount(1);await expect(panel.locator(".profile-review-box")).toHaveCount(0);}}
 expect(state.writes).toEqual([]);expect(state.unexpected).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
