import { expect, test, type Page } from "@playwright/test";
// Production renderer; all API calls intercepted, non-GET requests blocked.
const origin = process.env.PORTAL_BASE || "http://127.0.0.1:3779";
test.use({baseURL:origin,serviceWorkers:"block"});
const portrait = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect width="480" height="360" fill="#d9e4df"/><text x="100" y="180" font-size="24">Synthetic photo</text></svg>');
const profile = {label:"Applicant 901",age:30,education:"bachelors",job:"Engineer",ethnicity:"Synthetic ethnicity",spouseRequirement1:"Kindness and shared values.\nFull answers remain visible.",spouseRequirement2:"Clear communication",shareableBio:"Synthetic authorized bio.\nSecond paragraph.",imageUrls:[portrait]};
async function mock(page: Page, role: "brother" | "sister", options: {photos?:boolean;denied?:boolean;contacts?:boolean;multiple?:boolean;expired?:boolean;closed?:boolean} = {}) {
 const writes:string[]=[]; const unexpected:string[]=[];
 const details={...profile,imageUrls:options.photos===false?[]:profile.imageUrls,...(options.contacts?{email:"synthetic@example.invalid",phone:"000-000-0000"}:{})};
 const row={reviewExpired:options.expired,interestId:"review",role,state:options.closed?"closed":options.contacts?"contacts_released":"in_review",ownAction:options.contacts||options.closed||options.expired?null:"review",ownDecision:"pending",canView:true};
 await page.routeWebSocket("**/*",socket=>socket.close());
 await page.route("**/*",route=>{
  const req=route.request();const url=new URL(req.url());
  if(url.origin!==origin) return route.abort();
  if(!url.pathname.startsWith("/api/"))return route.continue();
  if(req.method()!=="GET"){writes.push(url.pathname);return route.fulfill({status:403,json:{error:"Read only"}});}
  const headers={"cache-control":"no-store"};
  if(url.pathname==="/api/applicant/me")return route.fulfill({headers,json:{applicant:{name:"Synthetic Applicant",gender:role==="brother"?"male":"female",status:"approved",applicantNumber:999,profileCompletionStatus:"completed"},inbound:[],outbound:[],privateDocumented:[],canSubmitInterest:false,interestSubmissions:[],interestSubmissionLimit:3}});
  if(url.pathname==="/api/applicant/profile")return route.fulfill({headers,json:{registration:{name:"Synthetic Applicant",gender:role==="brother"?"male":"female",imageUrls:[],imageStorageIds:[],interestSubmissionNumbers:[]}}});
  if(url.pathname==="/api/applicant/interest-eligibility")return route.fulfill({headers,json:{canSubmitInterest:false}});
  if(url.pathname==="/api/applicant/events")return route.fulfill({headers,json:{upcoming:[],history:[],eligibleInterestEvents:[]}});
  if(url.pathname==="/api/applicant/matchmaker")return route.fulfill({headers,json:{optedIn:true,matches:[]}});
  if(url.pathname==="/api/applicant/female-review")return route.fulfill({headers,status:url.searchParams.has("interestId")&&options.denied?403:200,json:url.searchParams.has("interestId")?(options.denied?{error:"Review unavailable"}:{...row,profile:{...details,label:url.searchParams.get("interestId")==="second"?"Applicant 902":"Applicant 901"}}):{page:options.multiple?[row,{...row,interestId:"second"}]:[row],isDone:true,continueCursor:""}});
  unexpected.push(url.pathname);return route.fulfill({status:404,json:{error:"Blocked"}});
 });
 return {writes,unexpected};
}

for (const role of ["brother", "sister"] as const) for (const width of [390, 1280]) {
 test(role+" selected inline header removed, switching and keyboard decision "+width,async({page},info)=>{
  await page.setViewportSize({width,height:1000});const state=await mock(page,role,{multiple:true});
  const posts: unknown[]=[];
  await page.route("**/api/applicant/female-review*",route=>{
   if(route.request().method()!=="POST")return route.fallback();
   posts.push(route.request().postDataJSON());return route.fulfill({json:{success:true}});
  });
  await page.goto("/me#applicant-interests");
  const ribbon=page.getByRole("region",{name:"Received interest updates",exact:true});
  await expect(ribbon.locator("[data-connection-notice]")).toHaveCount(2);
  const panel=page.locator("#inline-selected-review");
  for(const [id,label] of [["review","Applicant 901"],["second","Applicant 902"]]){
   const link=ribbon.locator('[data-connection-notice="'+id+'"]').getByRole("link");
   await link.focus();await page.keyboard.press("Enter");
   await expect(panel).toBeFocused();await expect(panel.getByRole("heading",{name:label,exact:true})).toBeVisible();
   const embedded=page.locator("#inbound-interests #review-notifications");
   await expect(embedded.getByRole("link",{name:"Back to applicant interests"})).toHaveCount(0);
   await expect(embedded.getByRole("heading",{name:"Connection review",exact:true})).toHaveCount(0);
   await expect(embedded.getByText("This connection is awaiting your review.",{exact:true})).toHaveCount(0);
   await expect(panel.getByText("Profile details",{exact:true})).toBeVisible();await expect(panel.getByText("Clear communication",{exact:true})).toBeVisible();
   await expect(panel.getByAltText("Profile photo 1")).toBeVisible();await expect(panel.getByRole("button",{name:"Decline",exact:true})).toBeVisible();
   const next=panel.getByRole("region",{name:"What happens next"});
   if(role==="brother") await expect(next.locator("p")).toHaveText(["This applicant has expressed interest in getting to know you better.","If you accept, her full bio will become available for you to review. Accepting does not create a match and does not share any contact details.","A match is only created after you review her bio and give your final approval, she gives hers, and the admin approves.","If you decline, this connection will be closed and no contact details will be shared."]);
   else { await expect(next.locator("p")).toHaveCount(3); await expect(next).toContainText("Confirm your interest after reviewing the profile and bio."); }
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:info.outputPath(role+"-"+width+".png"),fullPage:true});
  const action=panel.getByRole("button",{name:role==="brother"?"Accept":"Confirm interest",exact:true});
  await action.focus();await page.keyboard.press("Enter");await expect.poll(()=>posts.length).toBe(1);
  expect(posts[0]).toEqual(role==="brother"?{action:"respond",interestId:"second",decision:"accept"}:{action:"confirm",interestId:"second",confirmed:true});
  expect(state.writes).toEqual([]);expect(state.unexpected).toEqual([]);
 });
 test(role+" standalone selected review header retained "+width,async({page})=>{
  await page.setViewportSize({width,height:1000});await mock(page,role);
  await page.goto("/dashboard?femaleReview=review");
  await expect(page.getByRole("link",{name:"Back to applicant interests"})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Connection review",exact:true})).toBeVisible();
  await expect(page.getByText("This connection is awaiting your review.",{exact:true})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Applicant 901",exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:role==="brother"?"Accept":"Confirm interest",exact:true})).toBeVisible();
 });
 for(const mode of ["expired","closed","contacts"] as const)test(role+" inline lifecycle "+mode+" "+width,async({page})=>{
  await page.setViewportSize({width,height:1000});await mock(page,role,{[mode]:true});
  await page.goto("/me?femaleReview=review#inbound-interests");
  await expect(page.locator("#inbound-interests #review-notifications").getByRole("heading",{name:mode==="expired"?"Review invitation expired":mode==="closed"?"Connection closed":"Contact sharing update",exact:true})).toBeVisible();
 });
}
