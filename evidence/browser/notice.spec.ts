import {test,expect} from "@playwright/test";
import crypto from "node:crypto";
for(const width of [1280,390,320]) test("rejection notice explanation "+width,async({page,context},info)=>{
const origin="http://127.0.0.1:3189"; await page.setViewportSize({width,height:900});
await context.addCookies([{name:"admin_token",value:crypto.createHash("sha256").update("synthetic-adminsynthetic-salt").digest("hex"),url:origin}]);
const profile={_id:"synthetic",_creationTime:1,name:"Synthetic Applicant",email:"synthetic@example.invalid",age:30,gender:"male",maritalStatus:"single",education:"Test",job:"Test",phone:"000",status:"pending",createdAt:1};
const mutations:string[]=[];
await page.route("**/*",async route=>{const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();if(!u.pathname.startsWith("/api/"))return route.continue();
if(u.pathname!=="/api/admin/bridge")return route.fulfill({json:{}});
const {name,kind}=route.request().postDataJSON();if(kind==="mutation"){mutations.push(name);return route.fulfill({json:{result:"synthetic"}});}
return route.fulfill({json:{result:name==="registrations.getAll"?[profile]:(name.includes("Page") || name.includes("profileFilter"))?{page:[],isDone:true,continueCursor:""}:[]}});});
await page.goto(origin+"/admin/profiles");await page.getByRole("row").filter({hasText:"synthetic@example.invalid"}).click();
await expect(page.getByText(/Rejecting the whole profile queues/)).toBeVisible();
await expect(page.getByText(/Event rejection does not send this notice/)).toBeVisible();
await page.getByRole("button",{name:"Reject profile",exact:true}).scrollIntoViewIfNeeded();
await page.screenshot({path:info.outputPath("notice.png"),fullPage:true});
await page.getByRole("button",{name:"Reject profile",exact:true}).click();expect(mutations).toEqual(["registrations.updateStatus"]);
});