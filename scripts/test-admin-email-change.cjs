/* eslint-disable @typescript-eslint/no-require-imports */
// Render shipped React UI with synthetic fetch only. Never contacts a backend.
const fs=require('node:fs');const path=require('node:path');const esbuild=require('esbuild');const {chromium,expect}=require('@playwright/test');const assert=require('node:assert/strict');
(async()=>{
 const dir=process.env.EVIDENCE_DIR;if(!dir)throw Error('Set EVIDENCE_DIR inside the project');fs.mkdirSync(dir,{recursive:true});
 const result=await esbuild.build({stdin:{contents:'import React from "react";import {createRoot} from "react-dom/client";import {ChangeEmailForm} from "./src/components/admin/profiles/change-email-form";createRoot(document.getElementById("root")).render(<ChangeEmailForm registrationId="synthetic" email="old@example.invalid"/>);',resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},tsconfig:'tsconfig.json'});
 const css=await esbuild.build({entryPoints:['src/app/globals.css'],conditions:['style'],bundle:true,write:false,loader:{'.woff2':'dataurl'}});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{for(const width of [1280,390,320]){
 const page=await browser.newPage({viewport:{width,height:900}});let external=0;await page.route('**/*',r=>{external++;return r.abort();});
 await page.setContent('<main data-admin style="padding:20px;min-height:100vh"><div id="root" style="max-width:600px"></div></main>');await page.addStyleTag({content:css.outputFiles[0].text});
 await page.evaluate(()=>{window.calls=[];window.fail=true;window.fetch=async(url,init)=>{window.calls.push({url,body:JSON.parse(init.body)});return new Response(JSON.stringify(window.fail?{error:'Email changed; refresh the profile'}:{email:'new@example.invalid'}),{status:window.fail?409:200});};});
 await page.addScriptTag({content:result.outputFiles[0].text});const open=page.getByRole('button',{name:'Change email',exact:true});await open.focus();await page.keyboard.press('Enter');
 const submit=page.getByRole('button',{name:'Confirm email change'});await expect(submit).toBeDisabled();
 await page.getByLabel('New email',{exact:true}).fill('new@example.invalid');await page.getByLabel('Reason for change').fill('Synthetic consent verified');await page.getByRole('checkbox').check();await submit.click();
 await expect(page.getByRole('alert')).toHaveText('Email changed; refresh the profile');await expect(page.getByLabel('New email',{exact:true})).toHaveValue('new@example.invalid');
 await page.screenshot({path:path.join(dir,'editor-'+width+'.png')});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.getByLabel('New email',{exact:true}).fill('other@example.invalid');await expect(submit).toBeDisabled();await page.getByLabel('New email',{exact:true}).fill('new@example.invalid');await page.getByRole('checkbox').check();await page.evaluate(()=>window.fail=false);await submit.click();
 await expect(page.getByRole('status')).toContainText('No email was sent');const calls=await page.evaluate(()=>window.calls);assert.equal(calls.length,2);assert.deepEqual(calls[1].body,{registrationId:'synthetic',expectedOldEmail:'old@example.invalid',newEmail:'new@example.invalid',reason:'Synthetic consent verified'});assert.equal(external,0);await page.close();
 }console.log('PASS: keyboard, consent gate/reset, conflict retention, successful update, exact payload, 1280/390/320px overflow, zero network');}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
