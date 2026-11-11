import { test, expect } from "@playwright/test";
import crypto from "node:crypto";
const origin="http://127.0.0.1:3616";
for(const width of [1280,390,320]) for(const gender of ["male","female"]) for(const admin of [false,true]) test([admin?"admin":"applicant",gender,width].join(" "),async({page,context},info)=>{
 await page.setViewportSize({width,height:950});
 if(admin) await context.addCookies([{name:"admin_token",value:crypto.createHash("sha256").update("synthetic3616synthetic-salt").digest("hex"),url:origin}]);
 let writes=0; let fail=false;
 const profile={_id:"fixture",_creationTime:1,name:"Synthetic Applicant",gender,age:30,email:"fixture@example.com",publicApplicantNumber:999,status:"approved",paymentStatus:"paid",imageUrls:[],imageStorageIds:[],interestSubmissionNumbers:[],shareableBio:"Synthetic bio",adminNotes:"Synthetic note"};
 await page.routeWebSocket("**/*",s=>s.close());
 await page.route("**/*",route=>{
  const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();if(!u.pathname.startsWith("/api/"))return route.continue();
  if(u.pathname==="/api/admin/bridge"){const b=route.request().postDataJSON();expect(b.kind).toBe("query");return route.fulfill({json:{result:b.name==="registrations.getAll"?[profile]:b.name.includes("Catalog")?{page:[],isDone:true,continueCursor:""}:[]}});}
  if(route.request().method()!=="GET"){writes++;return route.fulfill({status:403,json:{error:"Writes blocked"}});}
  if(u.pathname==="/api/applicant/me")return route.fulfill({status:fail?503:200,json:fail?{error:"Refresh unavailable"}:{applicant:{...profile,applicantNumber:999,profileCompletionStatus:"completed"},inbound:[],outbound:[],privateDocumented:[],canSubmitInterest:false,interestSubmissions:[]}});
  if(u.pathname==="/api/applicant/profile")return route.fulfill({json:{registration:profile}});
  if(u.pathname==="/api/applicant/events")return route.fulfill({json:{upcoming:[],history:[]}});
  if(u.pathname==="/api/applicant/female-review")return route.fulfill({json:{page:[],isDone:true,continueCursor:""}});
  if(u.pathname==="/api/applicant/matchmaker")return route.fulfill({json:{optedIn:false,matches:[]}});
  return route.fulfill({json:{canSubmitInterest:false}});
 });
 await page.goto(admin?"/admin/profiles?profile=fixture":"/me#profile");
 const archive=page.getByRole("region",{name:"Participant archive",exact:true});await expect(archive).toBeVisible();
 const verify=async()=>{expect(await archive.evaluate(el=>Array.from(el.parentElement!.children).filter(x=>x.getBoundingClientRect().height>0).at(-1)===el)).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);};
 await verify();
 if(!admin){await page.locator("#shareableBio").fill("Unsaved local bio");fail=true;await page.evaluate(()=>window.dispatchEvent(new Event("focus")));await expect(page.getByRole("alert").filter({hasText:"Refresh unavailable"})).toContainText("Refresh unavailable");await expect(page.locator("#shareableBio")).toHaveValue("Unsaved local bio");await expect(page.getByRole("region",{name:"Your notifications",exact:true})).toHaveCount(0);fail=false;await page.getByRole("button",{name:"Retry refresh"}).click();await expect(page.getByRole("region",{name:"Your notifications",exact:true})).toHaveCount(1);await expect(page.locator("#shareableBio")).toHaveValue("Unsaved local bio");
 for(const hash of ["#overview","#applicant-interests","#matchmaker-matching","#profile"]){await page.evaluate(h=>{location.hash=h},hash);await verify();}}
 await archive.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath("bottom.png")});
 await archive.getByRole("button",{name:"Archive participant",exact:true}).click();const dialog=page.getByRole("dialog").last();await expect(dialog.getByRole("button",{name:"Cancel",exact:true})).toBeFocused();await expect(dialog).toContainText("No refund is issued automatically");await dialog.getByRole("button",{name:"Cancel",exact:true}).click();expect(writes).toBe(0);
});
