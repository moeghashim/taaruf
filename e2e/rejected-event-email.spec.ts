import { test, expect } from "@playwright/test";
import crypto from "node:crypto";
for (const width of [1280,390,320]) test("rejected profile messaging and eligible broadcast at "+width, async({page,context},info)=>{
 await page.setViewportSize({width,height:900});
 const origin=process.env.TEST_BASE_URL ?? "http://127.0.0.1:3157";
 await context.addCookies([{name:"admin_token",value:crypto.createHash("sha256").update("synthetic-eventsynthetic-salt").digest("hex"),url:origin}]);
 const event={_id:"event",title:"Synthetic event",eventCode:"synthetic",series:"1plus1_match",status:"scheduled",startsAt:Date.now()+100000,endsAt:Date.now()+200000,location:"Test",maleCapacity:60,femaleCapacity:60,counts:{malePending:0,maleApproved:0,femalePending:0,femaleApproved:0,maleWaitlisted:0,femaleWaitlisted:0}};
 const rows=[... ["pending","approved","waitlisted","rejected","withdrawn"].map((registrationStatus,i)=>({_id:"blocked"+i,registrationStatus,registration:{_id:"profile"+i,name:"Blocked "+i,status:"rejected",email:"synthetic@example.invalid"}})),{_id:"failed",registrationStatus:"approved",registration:{_id:"failed-profile",name:"Failed check",status:"approved",backgroundCheck:"failed"}},{_id:"eligible",registrationStatus:"withdrawn",registration:{_id:"eligible-profile",name:"Eligible",status:"approved"}},{_id:"pending-profile",registrationStatus:"pending",registration:{_id:"pending-profile-id",name:"Pending profile",status:"pending"}}].map(row=>({...row,gender:"male",createdAt:1,confirmationStatus:"cancelled",attendanceStatus:"not_checked_in"}));
 const sent:string[]=[];
 await page.route("**/*",async route=>{
  const url=new URL(route.request().url());
  if(url.origin!==origin)return route.abort();
  if(!url.pathname.startsWith("/api/"))return route.continue();
  if(url.pathname==="/api/admin/event-registration-email"){sent.push(route.request().postDataJSON().eventRegistrationId);return route.fulfill({json:{success:true}});}
  if(url.pathname!=="/api/admin/bridge")return route.fulfill({json:{}});
  const {name,kind}=route.request().postDataJSON();expect(kind).toBe("query");
  const result=name==="events.getAll"?[event]:name==="events.getDetail"?{...event,registrations:rows,waitlistEntries:[],canDelete:false}:[];
  return route.fulfill({json:{result}});
 });
 await page.goto(origin+"/admin/events");
 await page.getByRole("button",{name:/Synthetic event/}).click();
 for(const name of ["Blocked 0","Blocked 1","Blocked 2","Blocked 3","Blocked 4","Failed check"]){
  const row=page.locator(".interest-row").filter({has:page.getByRole("button",{name:"View profile for "+name,exact:true})});
  await expect(row.getByRole("button",{name:"Send Email",exact:true})).toHaveCount(0);
  await expect(row.getByRole("button",{name:"Request Confirm",exact:true})).toHaveCount(0);
  await expect(row.getByLabel("Confirmation status",{exact:true}).locator('option[value="confirmed"]')).toBeDisabled();
 }
 await expect(page.getByRole("button",{name:"Send Email",exact:true})).toHaveCount(2);
 await expect(page.getByRole("button",{name:"Request Confirm",exact:true})).toHaveCount(2);
 await page.screenshot({path:info.outputPath("rejected-event-email.png"),fullPage:true});
 page.on("dialog",dialog=>dialog.accept());
 await page.getByRole("button",{name:"Broadcast to Eligible (2)",exact:true}).click();
 await expect(page.getByText("Broadcast complete. Sent 2, already sent 0, failed 0.")).toBeVisible();
 expect(sent).toEqual(["eligible","pending-profile"]);
});
