/* eslint-disable @typescript-eslint/no-require-imports */
// Isolated real React forms, synthetic fixtures, no backend or external traffic.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const { chromium, expect } = require('@playwright/test');
const fixture = {
  name: 'Synthetic Birthday Applicant', gender: 'male', email: 'birthday@example.invalid',
  age: 30, dateOfBirth: '1996-05-14', education: 'bachelor', ethnicity: 'Synthetic',
  imageStorageIds: ['synthetic-photo'], imageUrls: ['data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="%23ddd"/%3E%3C/svg%3E'],
  prayerCommitment: 'always_five', hijabResponse: 'yes', spouseRequirement1: 'Kindness',
  spouseRequirement2: 'Honesty', spouseRequirement3: 'Faith', shareableBio: 'Synthetic test biography.',
  photoSharingPermission: 'no', interestSubmission: '', interestSubmissionNumbers: [],
  applicantNotesToAdmin: '', profileCompletionStatus: 'completed',
};
const stubs = { name: 'next-browser-isolation', setup(build) {
  build.onResolve({filter: /^next\/(image|link|navigation)$/}, args => ({path:args.path,namespace:'synthetic-next'}));
  build.onLoad({filter:/.*/,namespace:'synthetic-next'}, args => ({loader:'jsx',resolveDir:process.cwd(),contents:
    args.path==='next/navigation' ? 'const router={replace(){throw Error("Unexpected navigation")},push(){throw Error("Unexpected navigation")}};export const useRouter=()=>router;' :
    args.path==='next/image' ? 'import React from "react";export default function Image({fill,unoptimized,priority,...p}){return <img {...p}/>;}' :
    'import React from "react";export default function Link({prefetch,...p}){return <a {...p}/>;}'
  }));
}};
(async () => {
  const dir=path.resolve(process.env.EVIDENCE_DIR || 'docs/evidence/issue46');
  assert(dir.startsWith(process.cwd()+path.sep), 'Evidence must stay inside worktree');
  fs.mkdirSync(dir,{recursive:true});
  const css=await esbuild.build({entryPoints:['src/app/globals.css'],conditions:['style'],bundle:true,write:false,loader:{'.woff2':'dataurl'}});
  const sources={signup:'import {RegistrationForm as Form} from "./src/components/registration-form";',legacy:'import {ProfileCompletionForm as Form} from "./src/components/profile-completion-form";',me:'import Form from "./src/app/me/page";'};
  const bundles={};
  for(const [kind,source] of Object.entries(sources)) {
    const result=await esbuild.build({stdin:{contents:'import React from "react";import {createRoot} from "react-dom/client";'+source+'const root=createRoot(document.getElementById("root"));let key=0;window.remount=()=>root.render(<Form key={++key} token="synthetic-token"/>);window.remount();',resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},tsconfig:'tsconfig.json',plugins:[stubs]});
    bundles[kind]=result.outputFiles[0].text;
  }
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const results=[];
  try {
    for(const width of [1280,390,320]) for(const kind of Object.keys(sources)) {
      const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
      let external=0; await context.route('**/*',r=>{external++;return r.abort();});
      const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.clock.install({time:new Date('2026-11-10T12:00:00Z')});
      await page.setContent('<main data-admin><div id="root"></div></main>');
      await page.addStyleTag({content:css.outputFiles[0].text});
      await page.evaluate(profile=>{
        window.saved=profile;window.calls=[];
        const dashboard={applicant:{name:profile.name,gender:'male',applicantNumber:999,profileCompletionStatus:'completed',hasPhotos:true},inbound:[],outbound:[],privateDocumented:[],canSubmitInterest:false,interestSubmissionLimit:3,interestSubmissionEventId:null,interestSubmissions:[]};
        window.fetch=async (url,init={})=>{
          const method=init.method||'GET';const body=init.body?JSON.parse(init.body):null;window.calls.push({url,method,body});
          let data;
          if(url==='/api/profile/synthetic-token'||url==='/api/applicant/profile') {
            if(method==='POST') window.saved={...window.saved,...body};
            data={registration:window.saved,success:true};
          } else if(url.startsWith('/api/applicant/me')) data=dashboard;
          else if(url==='/api/applicant/events') data={upcoming:[],history:[]};
          else if(url==='/api/applicant/interest-eligibility') data={canSubmitInterest:false};
          else throw Error('Unexpected synthetic fetch: '+url);
          return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
        };
        window.XMLHttpRequest=class {constructor(){throw Error('XHR forbidden')}};
        window.WebSocket=class {constructor(){throw Error('WebSocket forbidden')}};
        window.EventSource=class {constructor(){throw Error('EventSource forbidden')}};
      },fixture);
      await page.addScriptTag({content:bundles[kind]});
      const dob=page.getByLabel(/date of birth/i).first();await expect(dob).toBeVisible();
      await expect(dob).toHaveAttribute('type','date');
      await expect(page.locator('#birthday-help')).toContainText('Your age is shared with matches, not your date of birth');
      await expect(dob).toHaveValue(kind==='signup'?'':fixture.dateOfBirth);
      await dob.fill('2008-11-10');await expect(dob).toHaveAttribute('aria-invalid','false');
      await dob.fill('2008-11-11');await expect(dob).toHaveAttribute('aria-invalid','true');
      await dob.fill('2027-01-01');await expect(dob).toHaveAttribute('aria-invalid','true');
      await dob.fill('1926-11-10');await expect(dob).toHaveAttribute('aria-invalid','true');
      await dob.fill('1926-11-11');await expect(dob).toHaveAttribute('aria-invalid','false');
      await dob.fill('');await expect(dob).toHaveAttribute('aria-invalid','true');
      await dob.fill('1994-02-28');
      await dob.scrollIntoViewIfNeeded();
      await page.screenshot({path:path.join(dir,kind+'-'+width+'.png')});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),kind+' horizontal overflow at '+width);
      if(kind!=='signup') {
        const save=page.getByRole('button',{name:/^save profile$/i});
        await save.click();await expect.poll(()=>page.evaluate(()=>window.calls.filter(c=>c.method==='POST').length)).toBe(1);
        const call=await page.evaluate(()=>window.calls.find(c=>c.method==='POST'));
        assert.equal(call.body.dateOfBirth,'1994-02-28');assert(!('age' in call.body),'should not send independently editable age');
        await expect(dob).toHaveValue('1994-02-28');
        const old = await dob.elementHandle();
        await page.evaluate(()=>window.remount());
        await expect.poll(()=>old.evaluate(el=>el.isConnected)).toBe(false);
        await expect(dob).toHaveValue('1994-02-28');
        await dob.fill('2008-11-11');await expect(dob).toHaveAttribute('aria-invalid','true');await save.click();assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.method==='POST').length),1);
        await page.evaluate(()=>{delete window.saved.dateOfBirth;window.saved.age=42;window.remount();});await expect(dob).toHaveValue('');
        await dob.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(dir,kind+'-unknown-'+width+'.png')});
      }
      assert.deepEqual(errors,[],kind+' browser errors');assert.equal(external,0,'no network attempts');
      results.push({kind,width,boundaries:true,privacyText:true,overflow:false,saveRemount:kind!=='signup',unknownLegacyEmpty:kind!=='signup',networkAttempts:external});
      await context.close();
    }
    fs.writeFileSync(path.join(dir,'browser-results.json'),JSON.stringify({scope:'Static isolated real React components with synthetic API and Next image/link/router substitutes. Not live backend E2E; signup submission/photo/payment not tested.',fixedDate:'2026-11-10',results},null,2)+'\n');
    console.log('PASS birthday browser: '+results.length+' rendered form/viewport combinations; synthetic save/remount; boundaries; unknown legacy empty; privacy copy; zero network.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
