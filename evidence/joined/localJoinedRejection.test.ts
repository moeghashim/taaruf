// @vitest-environment node
// Local synthetic full-route + real-function harness; NOT a native Convex server.
import { convexTest } from "convex-test";
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { expect, test, vi } from "vitest";
import schema from "../../convex/schema";
import { modules } from "../../convex/test.setup";
import { internal } from "../../convex/_generated/api";
const boundary = vi.hoisted(() => ({ client: null as ReturnType<typeof convexTest> | null, cookie: "" }));
vi.mock("@/lib/convex", () => ({ getConvexClient: () => boundary.client }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (key: string) => {
 const value = boundary.cookie.split("; ").find(x => x.startsWith(key + "="))?.slice(key.length + 1);
 return value ? { value } : undefined;
} }) }));
const email = vi.hoisted(() => ({ send: vi.fn(async () => ({ success:true,id:"synthetic-event-provider" })) }));
vi.mock("@/lib/email", () => ({ sendEventRegistrationStatusEmail: email.send, sendEventRegistrationReceivedEmail: email.send, sendConfirmationEmail: email.send }));
import { POST as bridge } from "../../src/app/api/admin/bridge/route";
import { GET as events, POST as eventWrite } from "../../src/app/api/applicant/events/route";
import { GET as me } from "../../src/app/api/applicant/me/route";
import { GET as eligibility } from "../../src/app/api/applicant/interest-eligibility/route";
import { GET as femaleReview } from "../../src/app/api/applicant/female-review/route";
import { GET as profile } from "../../src/app/api/applicant/profile/route";
import { POST as eventEmail } from "../../src/app/api/admin/event-registration-email/route";
const origin="http://127.0.0.1:3197";
const hash=(s:string)=>createHash("sha256").update(s).digest("hex");
test("joined local frontend → real Next handlers → real Convex functions → synthetic outbox/provider", async()=>{
 vi.stubEnv("ATTENDANCE_ADMIN_SECRET","synthetic-joined"); vi.stubEnv("ADMIN_PASSWORD","synthetic-password"); vi.stubEnv("ADMIN_TOKEN_SALT","synthetic-salt");
 vi.stubEnv("PROFILE_REJECTION_NOTICE_APPROVED","true"); vi.stubEnv("PROFILE_REJECTION_NOTICE_RESEND_API_KEY","synthetic-never-real"); vi.stubEnv("PROFILE_REJECTION_NOTICE_FROM","Test <test@example.invalid>");
 const provider=vi.fn(async(_url: string | URL | Request, _init?: RequestInit)=>{ void _url; void _init; return new Response(JSON.stringify({id:"synthetic-rejection-provider"}),{status:200}); });
 vi.stubGlobal("fetch",provider); // Every worker fetch is intercepted: no provider network.
 const t=convexTest(schema,modules); boundary.client=t;
 const ids=await t.run(async ctx=>{
  const registrationId=await ctx.db.insert("registrations",{name:"Synthetic Joined",email:"joined@example.invalid",age:30,gender:"male",maritalStatus:"single",education:"College",job:"Test",phone:"000",status:"approved",profileCompletionStatus:"completed",createdAt:1});
  const eventId=await ctx.db.insert("events",{title:"Private November Meeting",eventCode:"joined-local",eventMonth:"2026-11",series:"1plus1_match",location:"Private Local Venue",startsAt:Date.now()+86400000,endsAt:Date.now()+93600000,status:"scheduled",maleCapacity:60,femaleCapacity:60,createdAt:1,updatedAt:1});
  const eventRegistrationId=await ctx.db.insert("eventRegistrations",{eventId,registrationId,gender:"male",registrationStatus:"approved",confirmationStatus:"not_confirmed",attendanceStatus:"attended",eligibilityStatus:"approved_member",createdAt:1,updatedAt:1});
  await ctx.db.insert("applicantSessions",{registrationId,sessionHash:hash("synthetic-session"),expiresAt:Date.now()+3600000,createdAt:1});
  return {registrationId,eventId,eventRegistrationId};
 });
 const adminCookie="admin_token="+hash("synthetic-passwordsynthetic-salt");
 const applicantCookie="applicant_session=synthetic-session";
 const dispatch=async(path:string,method="GET",body?:unknown,cookie=applicantCookie,requestOrigin=origin)=>{
  boundary.cookie=cookie;
  const req=new NextRequest(origin+path,{method,headers:{cookie,origin:requestOrigin,host:"127.0.0.1:3197","content-type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
  if(path==="/api/admin/bridge") return bridge(req);
  if(path==="/api/admin/event-registration-email") return eventEmail(req);
  if(path==="/api/applicant/events") return method==="GET"?events():eventWrite(req);
  if(path==="/api/applicant/me") return me(req);
  if(path==="/api/applicant/interest-eligibility") return eligibility();
  if(path==="/api/applicant/profile") return profile();
  if(path==="/api/applicant/female-review") return femaleReview(req);
  throw new Error("Unexpected API: "+path);
 };
 const status=async(value:string)=>{
  const response=await dispatch("/api/admin/bridge","POST",{kind:"mutation",name:"registrations.updateStatus",args:{id:ids.registrationId,status:value}},adminCookie);
  expect(response.status).toBe(200);
 };
 const rows=()=>t.run(ctx=>ctx.db.query("profileRejectionNotices").collect());
 const browser=await chromium.launch({channel:"chrome",headless:true});
 try {
  expect((await dispatch("/api/applicant/events","GET",undefined,"")).status).toBe(401);
  expect((await dispatch("/api/admin/bridge","POST",{},"")).status).toBe(401);
  expect((await dispatch("/api/admin/bridge","POST",{},adminCookie,"https://evil.invalid")).status).toBe(403);
  await t.mutation(internal.profileRejectionNotice.activate,{});
  const page=await browser.newPage({viewport:{width:390,height:900}});
  await page.context().addCookies([{name:"applicant_session",value:"synthetic-session",url:origin}]);
  const routeErrors:string[]=[];
  let queue=Promise.resolve();
  await page.route("**/*",async route=>{
   const url=new URL(route.request().url());
   if(url.origin!==origin) return route.abort();
   if(!url.pathname.startsWith("/api/")) return route.continue();
   // Transport adapter only: all response bodies come from real route handlers.
   queue=queue.then(async()=>{
    try { const response=await dispatch(url.pathname,route.request().method(),route.request().postDataJSON()??undefined,route.request().headers()["cookie"]??"");
     await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
    } catch(error) {routeErrors.push(String(error)); await route.fulfill({status:500,json:{error:String(error)}});}
   }); await queue;
  });
  await page.goto(origin+"/me#events");
  const section=page.locator("#events");
  await expect.poll(()=>section.textContent()).toContain("Private Local Venue");
  // Eligible controls reach real mutation and event-email claim, mail transport mocked.
  expect((await dispatch("/api/applicant/events","POST",{action:"confirm",eventRegistrationId:ids.eventRegistrationId})).status).toBe(200);
  expect((await dispatch("/api/admin/event-registration-email","POST",{eventRegistrationId:ids.eventRegistrationId,kind:"approved"},adminCookie)).status).toBe(200);
  expect(email.send).toHaveBeenCalledTimes(1);
  await status("rejected"); const deadline=(await rows())[0].notBefore!;
  await status("rejected"); expect(await rows()).toHaveLength(1); expect((await rows())[0].notBefore).toBe(deadline);
  expect(deadline-Date.now()).toBeGreaterThan(890000);
  await t.action(internal.profileRejectionNotice.drain,{}); expect(provider).not.toHaveBeenCalled();
  await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
  await expect.poll(()=>section.textContent()).not.toContain("Private Local Venue");
  expect(await section.getByRole("button",{name:/Register|Confirm/}).count()).toBe(0);
  for(const path of ["/api/applicant/events","/api/applicant/me","/api/applicant/interest-eligibility"]){
   const response=await dispatch(path); expect(response.status).toBe(200); const text=await response.text(); expect(text).not.toContain("Private Local Venue"); expect(text).not.toContain("Private November Meeting");
  }
  expect((await dispatch("/api/applicant/events","POST",{action:"register",eventId:ids.eventId})).status).toBe(500);
  expect((await dispatch("/api/applicant/events","POST",{action:"confirm",eventRegistrationId:ids.eventRegistrationId})).status).toBe(500);
  for(const kind of ["approved","waitlisted","confirmation_request","cancelled","reminder"]){
   await dispatch("/api/admin/event-registration-email","POST",{eventRegistrationId:ids.eventRegistrationId,kind,force:true},adminCookie);
  }
  expect(email.send).toHaveBeenCalledTimes(1);
  // Advance only the backend Date clock, not browser/network timers.
  const clock=vi.spyOn(Date,"now").mockReturnValue(deadline-1);
  await t.action(internal.profileRejectionNotice.drain,{}); expect(provider).not.toHaveBeenCalled();
  clock.mockReturnValue(deadline);
  provider.mockRejectedValueOnce(new Error("synthetic timeout"));
  await t.action(internal.profileRejectionNotice.drain,{}); let row=(await rows())[0]; expect(row.state).toBe("pending");
  await t.run(ctx=>ctx.db.patch(row._id,{nextAttemptAt:0}));
  await t.action(internal.profileRejectionNotice.drain,{}); row=(await rows())[0]; expect(row.state).toBe("accepted");
  expect(provider).toHaveBeenCalledTimes(2);
  expect(provider.mock.calls[0][0]).toBe("https://api.resend.com/emails");
  expect(provider.mock.calls[0][1]?.body).toBe(provider.mock.calls[1][1]?.body);
  expect(provider.mock.calls[0][1]?.headers).toEqual(provider.mock.calls[1][1]?.headers);
  await t.action(internal.profileRejectionNotice.drain,{}); expect(provider).toHaveBeenCalledTimes(2);
  await status("approved"); await page.reload(); await expect.poll(()=>section.textContent()).toContain("Private Local Venue");
  await status("rejected"); expect(await rows()).toHaveLength(1); await t.action(internal.profileRejectionNotice.drain,{}); expect(provider).toHaveBeenCalledTimes(2);
  await page.reload(); await expect.poll(()=>section.textContent()).toContain("Your registration history is retained");
  await page.screenshot({path:"evidence/local-joined-rejected.png",fullPage:true});
  expect(routeErrors).toEqual([]);
  // Synthetic reset: cancelled provably-unattempted cycle gets a fresh grace.
  await t.run(ctx=>ctx.db.delete(row._id)); await status("approved"); await status("rejected");
  const oldDeadline=(await rows())[0].notBefore!;
  clock.mockReturnValue(deadline+300000); await status("approved");
  expect((await rows())[0].state).toBe("cancelled");
  await t.action(internal.profileRejectionNotice.drain,{}); expect(provider).toHaveBeenCalledTimes(2);
  await status("rejected"); const fresh=(await rows())[0];
  expect(fresh.state).toBe("pending"); expect(fresh.notBefore).toBe(deadline+1200000);
  clock.mockReturnValue(oldDeadline); await t.action(internal.profileRejectionNotice.drain,{}); expect(provider).toHaveBeenCalledTimes(2);
  clock.mockReturnValue(fresh.notBefore!-1); await t.action(internal.profileRejectionNotice.drain,{}); expect(provider).toHaveBeenCalledTimes(2);
  clock.mockReturnValue(fresh.notBefore!); await t.action(internal.profileRejectionNotice.drain,{}); expect(provider).toHaveBeenCalledTimes(3);
  expect((await rows())[0].state).toBe("accepted");
  clock.mockRestore();
  vi.stubEnv("PROFILE_REJECTION_NOTICE_APPROVED","false"); expect(await t.mutation(internal.profileRejectionNotice.claim,{})).toBeNull();
  console.log("JOINED PASS: browser real UI + Next handlers/auth + real Convex functions; eligible/rejected controls, outbox, retry, duplicate, reversal, disabled gate; network provider calls=0");
 } finally {await browser.close(); vi.restoreAllMocks(); vi.unstubAllGlobals();vi.unstubAllEnvs();}
},90000);
