/* eslint-disable @typescript-eslint/no-require-imports */
// Real React components, synthetic in-memory backend, no network/data writes.
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const { chromium, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
(async () => {
 const dir = path.resolve(process.env.EVIDENCE_DIR || '/tmp/pr61-pr65-pr78-browser'); fs.mkdirSync(dir,{recursive:true});
 const result = await esbuild.build({ stdin: { contents: 'import "./scripts/event-profiles-fixture"; import React from "react"; import {createRoot} from "react-dom/client"; import {EventsPageClient} from "./src/components/admin/events/events-page-client"; createRoot(document.getElementById("root")).render(<EventsPageClient/>);', resolveDir: process.cwd(), loader:'tsx' }, bundle:true, write:false, jsx:'automatic', define:{'process.env.NODE_ENV':'"development"'}, tsconfig:'tsconfig.json' });
 const browser = await chromium.launch({channel:'chrome',headless:true});
 try {
 const page = await browser.newPage({viewport:{width:Number(process.env.TEST_WIDTH || 1440),height:1000}});
 page.setDefaultTimeout(10000); page.on('pageerror', e => console.error('Synthetic page error:', e.message));
 let external = 0; await page.route('**/*', route => {external++; return route.abort();});
 await page.setContent('<div data-admin><div id="root"></div></div>');
 const css = await esbuild.build({entryPoints:['src/app/globals.css'],conditions:['style'],bundle:true,write:false,loader:{'.woff2':'dataurl'}});
 await page.addStyleTag({content:css.outputFiles[0].text});
 await page.addScriptTag({content:result.outputFiles[0].text});
 await page.getByRole('button',{name:/Synthetic event/}).click();
 const search = page.getByPlaceholder('Search name or number'); await search.fill('Synthetic 2');
 const trigger = page.getByRole('button',{name:'View profile for Synthetic 2'});
 await trigger.focus(); await page.keyboard.press('Enter');
 const dialog = page.getByRole('dialog'); await expect(dialog).toContainText('Synthetic 2 · Applicant #2');
 await expect(dialog.getByLabel('Admin notes')).toHaveValue('Note 2');
 await page.evaluate(() => window.fixture.remoteNotes('profile2', 'Remote clean update'));
 await expect(dialog.getByLabel('Admin notes')).toHaveValue('Remote clean update');
 await expect(dialog.getByRole('button',{name:'Save notes'})).toBeDisabled();
 await dialog.getByLabel('Admin notes').fill('Protected draft');
 await page.evaluate(() => window.fixture.remoteNotes('profile2', 'Another admin update'));
 await expect(dialog.getByLabel('Admin notes')).toHaveValue('Protected draft');
 await dialog.getByLabel('Admin notes').fill('Synthetic saved note');
 page.once('dialog', d => d.dismiss()); await page.keyboard.press('Escape'); await expect(dialog).toBeVisible();
 await dialog.getByRole('button',{name:'Save notes'}).click();
 await expect(dialog.getByRole('button',{name:'Save notes'})).toBeDisabled();
 await dialog.getByRole('button',{name:'Back to event'}).click(); await expect(trigger).toBeFocused();
 await expect(search).toHaveValue('Synthetic 2'); await trigger.click();
 await expect(dialog.getByLabel('Admin notes')).toHaveValue('Synthetic saved note');
 await page.evaluate(() => {window.fixture.failNotes=true;});
 await dialog.getByLabel('Admin notes').fill('Draft survives'); await dialog.getByRole('button',{name:'Save notes'}).click();
 await expect(dialog.getByRole('alert')).toContainText('Admin request failed. Refresh and try again.'); await expect(dialog.getByLabel('Admin notes')).toHaveValue('Draft survives');
 await page.evaluate(() => {window.fixture.failNotes=false;}); await dialog.getByRole('button',{name:'Save notes'}).click();
 await dialog.getByRole('button',{name:'Approve profile',exact:true}).click(); await expect(dialog.getByRole('button',{name:'Revoke profile approval'})).toBeVisible();
 await page.screenshot({path:path.join(dir,'desktop.png')});
 await page.setViewportSize({width:390,height:844}); await page.screenshot({path:path.join(dir,'mobile.png')});
 assert(await dialog.evaluate(el => el.getBoundingClientRect().width <= innerWidth));
 await dialog.getByRole('button',{name:'Back to event'}).click();
 await expect(page.getByLabel('Event registration status',{exact:true}).locator('option[value=approved]')).toBeDisabled();
 await page.getByLabel('Event registration status',{exact:true}).selectOption('pending'); await expect(page.getByText('Event capacity reached',{exact:true})).toBeVisible();
 await search.fill('Synthetic 1'); await page.getByRole('button',{name:'View profile for Synthetic 1'}).click();
 await expect(dialog.getByLabel('Admin notes')).toHaveValue('Note 1'); await dialog.getByRole('button',{name:'Reject profile',exact:true}).click();
 await dialog.getByRole('button',{name:'Back to event'}).click();
 for(const flag of ['loading','missing','error']) {
 await page.evaluate(flag => {window.fixture[flag]=true;window.fixture.refresh();},flag);
 await page.getByRole('button',{name:'View profile for Synthetic 1'}).click();
 await expect(dialog).toContainText(flag==='loading'?'Loading profile':flag==='missing'?'Profile unavailable':'Unable to load this profile');
 await dialog.getByRole('button',{name:'Back to event'}).click();
 await page.evaluate(flag => {window.fixture[flag]=false;window.fixture.refresh();},flag);
 }
 const calls = await page.evaluate(() => window.fixture.calls);
 assert(calls.some(c=>c.name==='registrations:updateAdminNotes'&&c.args.id==='profile2'&&c.args.adminNotes==='Synthetic saved note'));
 assert(calls.some(c=>c.name==='registrations:updateStatus'&&c.args.id==='profile2'&&c.args.status==='approved'));
 assert(calls.some(c=>c.name==='registrations:updateStatus'&&c.args.id==='profile1'&&c.args.status==='rejected'));
 assert.equal(calls.filter(c=>c.name==='events:updateRegistrationStatus').length,1);
 assert.equal(external,0); console.log('PASS: profile identity, keyboard/focus, retained filters, notes persistence/failure/unsaved guard, global approval/rejection scope, event capacity error, missing/loading/error, mobile width; zero network requests.');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
