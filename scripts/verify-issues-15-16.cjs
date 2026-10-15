const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { expect } = require('@playwright/test');
(async () => {
 const browser = await chromium.launch({headless:true, channel:'chrome'});
 try {
 const context = await browser.newContext();
 // Block backend WebSockets: these UI checks never read or mutate applicant data.
 await context.routeWebSocket(/convex/, socket => socket.close());
 const page = await context.newPage();
 await page.goto('http://127.0.0.1:3196/register');
 await page.locator('#gender').selectOption('female');
 assert.equal(await page.locator('label[for="hijabResponse"]').textContent(), 'Do you currently wear/practice hijab? *');
 assert.deepEqual(await page.locator('#hijabResponse option').allTextContents(), ['Select one','Yes, I wear Burqa','Yes, I wear Niqab','Yes','Not yet, but I am working on it','No']);
 await page.locator('#hijabResponse').selectOption('niqab');
 await page.locator('#gender').selectOption('male');
 assert.equal(await page.locator('#hijabResponse').inputValue(), '');
 assert.deepEqual(await page.locator('#hijabResponse option').allTextContents(), ['Select one','Yes','No','Open']);
 console.log('PASS: reactive gender label, female/male choices, answer reset');
 const auth = await context.request.post('http://127.0.0.1:3196/api/admin/auth', {data:{password:'local-issue-smoke-only'}});
 assert.equal(auth.status(),200);
 await page.goto('http://127.0.0.1:3196/admin/profiles');
 const search=page.getByRole('searchbox', {name:'Search profiles', exact:true});
 await search.fill('Amina & Noor'); await search.press('Enter');
 await page.waitForURL('**/admin/profiles?q=*');
 assert.equal(new URL(page.url()).searchParams.get('q'),'Amina & Noor');
 await expect(page.getByPlaceholder('Search by name, email, or phone…', {exact:true})).toHaveValue('Amina & Noor');
 await search.fill('Omar'); await search.press('Enter');
 await page.waitForURL('**/admin/profiles?q=Omar');
 await expect(page.getByPlaceholder('Search by name, email, or phone…', {exact:true})).toHaveValue('Omar');
 await search.fill(''); await search.press('Enter');
 await page.waitForURL('**/admin/profiles');
 await expect(page.getByPlaceholder('Search by name, email, or phone…', {exact:true})).toHaveValue('');
 console.log('PASS: admin search submit, encoded query, repeated search, clear');
 } finally {await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
