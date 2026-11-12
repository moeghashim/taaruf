import { test, expect } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../convex/schema';
import type { Id } from '../convex/_generated/dataModel';
import { modules } from '../convex/test.setup';
import { makeFunctionReference } from 'convex/server';
import { convexToJson, jsonToConvex, type Value } from 'convex/values';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { writeFileSync, createWriteStream, mkdirSync } from 'node:fs';
import { chromium, type Browser } from '@playwright/test';
const dir = process.env.ADMIN_ARCHIVE_PROOF_DIR || new URL('../privateops/admin-archive3919/', import.meta.url).pathname;
mkdirSync(dir,{recursive:true});
test('authenticated admin drawer archive through real Next routes and convex-test HTTP bridge', async () => {
 process.env.ATTENDANCE_ADMIN_SECRET='synthetic-admin-archive3919-only';
 const t=convexTest(schema,modules), calls: Array<{kind?: string; path?: string; success?: boolean; error?: string}>=[];
 const fixtures=await t.run(async ctx=>{
  const now=Date.now(), out: Array<{token: string; rowId: Id<'eventRegistrations'>; eventId: Id<'events'>; registrationId: Id<'registrations'>; label: string}>=[];
  for(const [index,label,status] of [[0,'Desktop','approved'],[1,'Mobile','approved'],[2,'Restricted','rejected']] as const){
   const token='synthetic-admin-archive3919-'+index;
   const registrationId=await ctx.db.insert('registrations',{publicApplicantNumber:32+index,name:'Synthetic '+label,age:30,gender:'male',maritalStatus:'single',education:'College',job:'Engineer',email:label.toLowerCase()+'@example.invalid',phone:'555',status,paymentStatus:'paid',profileCompletionStatus:'completed',photoSharingPermission:'ask_me_first',createdAt:now});
   await ctx.db.insert('applicantSessions',{registrationId,sessionHash:createHash('sha256').update(token).digest('hex'),expiresAt:now+3600000,createdAt:now});
   const eventId=await ctx.db.insert('events',{title:'Synthetic '+label+' Event',eventCode:'proof'+index,eventMonth:'2026-12',series:'1plus1_match',location:'Synthetic private venue',startsAt:now+86400000,endsAt:now+90000000,status:'scheduled',interestSubmissionsEnabled:false,maleCapacity:60,femaleCapacity:60,createdAt:now,updatedAt:now});
   const rowId=await ctx.db.insert('eventRegistrations',{eventId,registrationId,gender:'male',registrationStatus:'approved',attendanceStatus:'not_checked_in',confirmationStatus:'confirmed',eligibilityStatus:'approved_member',createdAt:now,updatedAt:now});
   out.push({token,rowId,eventId,registrationId,label});
  }
  return out;
 });
 const server=createServer(async(req,res)=>{
  try {
   let raw='';for await(const chunk of req)raw+=chunk;
   const body=JSON.parse(raw),kind=req.url?.split('/').pop();
   if(kind !== 'query' && kind !== 'mutation' && kind !== 'action')throw Error('unsupported '+req.url);
   const args=jsonToConvex(body.args[0]) as Record<string, Value>;
   const value=kind === 'query'
    ? await t.query(makeFunctionReference<'query'>(body.path),args)
    : kind === 'mutation'
      ? await t.mutation(makeFunctionReference<'mutation'>(body.path),args)
      : await t.action(makeFunctionReference<'action'>(body.path),args);
   calls.push({kind,path:body.path,success:true});
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify({status:'success',value:convexToJson(value??null),logLines:[]}));
  }catch(e){calls.push({path:req.url,error:String(e)});res.setHeader('Content-Type','application/json');res.end(JSON.stringify({status:'error',errorMessage:String(e),logLines:[]}));}
 });
 await new Promise<void>(r=>server.listen(15016,'127.0.0.1',r));
 const log=createWriteStream(dir+'next.log');
 const next=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','15015'],{cwd:process.cwd(),env:{...process.env,CONVEX_URL:'http://127.0.0.1:15016',NEXT_PUBLIC_CONVEX_URL:'http://127.0.0.1:15016',ADMIN_PASSWORD:'synthetic-admin3919',ADMIN_TOKEN_SALT:'synthetic-salt3919',ATTENDANCE_ADMIN_SECRET:'synthetic-admin-archive3919-only',NEXT_TELEMETRY_DISABLED:'1'}});
 next.stdout.pipe(log);next.stderr.pipe(log);
 let browser: Browser | undefined;
 const proof: {transport: string; cases: unknown[]; calls?: typeof calls}={transport:'browser -> real Next API -> local HTTP bridge -> actual Convex handlers -> convex-test DB',cases:[]};
 try {
  for(let i=0;i<90;i++){try{if((await fetch('http://127.0.0.1:15015/me')).ok)break;}catch{}await new Promise(r=>setTimeout(r,500));}
  browser=await chromium.launch({headless:true,channel:'chrome'});
  for(const fixture of fixtures){
   const context=await browser.newContext({viewport:fixture.label==='Mobile'?{width:390,height:844}:{width:1440,height:1000}});
   await context.addCookies([{name:'admin_token',value:createHash('sha256').update('synthetic-admin3919synthetic-salt3919').digest('hex'),url:'http://127.0.0.1:15015',httpOnly:true,sameSite:'Lax'}]);
   const page=await context.newPage();
   const errors:string[]=[];page.on('pageerror',(e)=>errors.push(String(e)));
   await page.goto('http://127.0.0.1:15015/admin/profiles?profile='+fixture.registrationId);
   const archive=page.getByRole('region',{name:'Participant archive'});
   await archive.getByRole('button',{name:'Archive participant',exact:true}).waitFor({timeout:60000});
   await archive.scrollIntoViewIfNeeded();
   expect(await archive.evaluate((el:Element)=>el===el.parentElement?.lastElementChild)).toBe(true);
   const before=await t.run(ctx=>ctx.db.get(fixture.rowId as Id<'eventRegistrations'>));
   await archive.getByRole('button',{name:'Archive participant',exact:true}).click();
   if(process.env.PROVE_BLOCKER==='1') {
    await page.screenshot({path:dir+'baseline-'+fixture.label.toLowerCase()+'.png',fullPage:true});
    const confirm=page.getByRole('button',{name:'Confirm archive',exact:true});
    const box=await confirm.boundingBox();
    const hit=await page.evaluate(({x,y}:{x:number;y:number})=>document.elementFromPoint(x,y)?.outerHTML,{x:box!.x+box!.width/2,y:box!.y+box!.height/2});
    let attempted=0;page.on('request',(r)=>{if(r.url().endsWith('/api/admin/archive'))attempted++});
    await page.mouse.click(box!.x+box!.width/2,box!.y+box!.height/2);
    await page.waitForTimeout(300);
    expect(attempted).toBe(0);expect(hit).toMatch(/backdrop|detail-pane|dp-body/);
    proof.cases.push({label:fixture.label,scenario:'real-pointer-confirm-blocked',hit,requestAttempted:attempted});
    expect(await t.run(ctx=>ctx.db.get(fixture.rowId as Id<'eventRegistrations'>))).toEqual(before);
    await context.close();continue;
   }
   expect(await page.getByRole('button',{name:'Cancel',exact:true}).evaluate((el:Element)=>el===document.activeElement)).toBe(true);
   await page.keyboard.press('Escape');
   await page.getByRole('dialog').waitFor({state:'hidden'});
   await expect.poll(()=>archive.getByRole('button',{name:'Archive participant',exact:true}).evaluate((el:Element)=>el===document.activeElement)).toBe(true);
   await archive.getByRole('button',{name:'Archive participant',exact:true}).click();
   await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();
   expect(await t.run(ctx=>ctx.db.get(fixture.rowId as Id<'eventRegistrations'>))).toEqual(before);
   await archive.getByRole('button',{name:'Archive participant',exact:true}).click();
   await page.screenshot({path:dir+fixture.label.toLowerCase()+'-before.png',fullPage:true});
   let attempted=0;
   await page.route('**/api/admin/archive',async(route)=>{attempted++;await new Promise(r=>setTimeout(r,2000));await route.abort('failed');});
   await page.getByRole('dialog').getByRole('button',{name:'Confirm archive',exact:true}).click();
   await page.getByRole('dialog').getByRole('button',{name:'Archiving…',exact:true}).waitFor();
   expect(await page.getByRole('dialog').getByRole('button',{name:'Archiving…',exact:true}).isDisabled()).toBe(true);
   await page.getByRole('dialog').getByRole('alert').waitFor();
   expect(attempted).toBe(1);
   expect(await t.run(ctx=>ctx.db.get(fixture.rowId as Id<'eventRegistrations'>))).toEqual(before);
   proof.cases.push({label:fixture.label,scenario:'delayed-then-failed-network',requestAttempted:attempted,pendingVisible:true,error:await page.getByRole('dialog').getByRole('alert').textContent(),noMutation:true});
   await page.screenshot({path:dir+fixture.label.toLowerCase()+'-network-error.png',fullPage:true});
   await page.unroute('**/api/admin/archive');
   const responsePromise=page.waitForResponse((r)=>r.url().endsWith('/api/admin/archive')&&r.request().method()==='POST');
   await page.getByRole('dialog').getByRole('button',{name:'Confirm archive',exact:true}).click();
   const response=await responsePromise;const payload=await response.json();
   const after=await t.run(ctx=>ctx.db.get(fixture.rowId as Id<'eventRegistrations'>));
   const profile=await t.run(ctx=>ctx.db.get(fixture.registrationId as Id<'registrations'>));
   proof.cases.push({label:fixture.label,before,after,profile,httpStatus:response.status(),payload,errors});
   await page.screenshot({path:dir+fixture.label.toLowerCase()+'-after.png',fullPage:true});
   expect(response.status()).toBe(200);expect(typeof profile?.archivedAt).toBe('number');expect(after?.registrationStatus).toBe('withdrawn');expect(after?.confirmationStatus).toBe('cancelled');expect(profile?.paymentStatus).toBe('paid');
   await archive.getByRole('button',{name:'Restore availability',exact:true}).waitFor();
   await context.close();
  }
  expect(calls.filter(c=>c.path==='archive:archiveAdmin'&&c.success)).toHaveLength(process.env.PROVE_BLOCKER==='1'?0:3);
 } finally {
  proof.calls=calls;writeFileSync(dir+'proof.json',JSON.stringify(proof,null,2));
  await browser?.close();next.kill('SIGTERM');await new Promise<void>(r=>server.close(()=>r()));log.end();
 }
});
