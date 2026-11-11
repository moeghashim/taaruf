import {test,expect} from "@playwright/test";
const origin=process.env.PORTAL_BASE||"http://127.0.0.1:3554";
for(const gender of ["male","female"]) for(const width of [1280,390,320]) for(const archived of [false,true]) test(`archive last ${gender} ${width} archived=${archived}`,async({page},info)=>{
 await page.setViewportSize({width,height:844});let writes=0;
 await page.routeWebSocket("**/*",s=>s.close());
 await page.route("**/*",route=>{const req=route.request(),u=new URL(req.url());if(u.origin!==origin)return route.abort();if(!u.pathname.startsWith("/api/"))return route.continue();if(req.method()!=="GET"){writes++;return route.abort();}
 const registration={name:"Synthetic",gender,archivedAt:archived?100:null,imageStorageIds:[],imageUrls:[],interestSubmissionNumbers:[]};
 if(u.pathname==="/api/applicant/me")return route.fulfill({json:{applicant:{...registration,status:"approved",applicantNumber:999,profileCompletionStatus:"completed"},inbound:[],outbound:[],privateDocumented:[],canSubmitInterest:false,interestSubmissions:[]}});
 if(u.pathname==="/api/applicant/profile")return route.fulfill({json:{registration}});
 if(u.pathname==="/api/applicant/events")return route.fulfill({json:{upcoming:[],history:[]}});
 if(u.pathname==="/api/applicant/matchmaker")return route.fulfill({json:{matches:[],optedIn:false}});
 if(u.pathname==="/api/applicant/female-review")return route.fulfill({json:{page:[],isDone:true,continueCursor:""}});
 return route.fulfill({json:{canSubmitInterest:false}});});
 await page.goto(origin+"/me");
 const card=page.getByRole("region",{name:"Participant archive",exact:true});
 for(const hash of ["#overview","#applicant-interests","#profile","#matchmaker-matching"]){
 await page.locator("nav.portal-pages a[href="+JSON.stringify(hash)+"]").click();
 await expect(card).toHaveCount(1);await expect(card).toBeVisible();
 expect(await card.evaluate(el=>el.parentElement?.lastElementChild===el)).toBe(true);
 expect(await card.evaluate(el=>{const y=el.getBoundingClientRect().top;return Array.from(el.parentElement!.children).filter(x=>x!==el&&x.getBoundingClientRect().height>0).every(x=>x.getBoundingClientRect().bottom<=y+1);})).toBe(true);
 }
 await card.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath("bottom.png")});
 const trigger=card.getByRole("button",{name:archived?"Restore availability":"Archive participant",exact:true});await trigger.focus();await page.keyboard.press("Enter");
 const dialog=page.getByRole("dialog");await expect(dialog).toBeVisible();await expect(dialog.getByRole("button",{name:"Cancel",exact:true})).toBeFocused();
 await expect(dialog).toContainText(archived?"does not rebook events":"No refund is issued automatically");
 await page.keyboard.press("Escape");await expect(dialog).not.toBeVisible();await expect(trigger).toBeFocused();expect(writes).toBe(0);
});
