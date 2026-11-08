// Synthetic-only browser regression. Bundles the actual Topbar and dialog, not a replica.
import { build } from 'esbuild';
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const output = '.new-match-browser';
await fs.mkdir(output, {recursive:true});
const bundle = await build({stdin:{contents:
  'import React from "react"; import {createRoot} from "react-dom/client"; import {Topbar} from "./src/components/admin/layout/topbar"; createRoot(document.getElementById("root")).render(<Topbar crumb="Workbench" onMenu={()=>{}}/>);',
  resolveDir:process.cwd(),loader:'tsx'}, bundle:true,write:false,format:'iife',jsx:'automatic',plugins:[{name:'synthetic-adapters',setup(b){
    b.onResolve({filter:new RegExp("^next/navigation$")}, args=>({path:args.path,namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'}, ()=>({loader:'js',contents: 'export const useRouter=()=>({push:url=>{window.destination=url}});' }));
  }}]});
const js=bundle.outputFiles[0].text;
const cssFiles=(await fs.readdir('.next/static/chunks')).filter(f=>f.endsWith('.css'));
const css=(await Promise.all(cssFiles.map(f=>fs.readFile('.next/static/chunks/'+f,'utf8')))).join('\n');
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<html><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><div data-admin id="root"></div><script>'+js+'</script></html>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true, channel:"chrome"});
try {
 for (const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
  const page=await browser.newPage({viewport}); const errors=[]; page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)}); page.setDefaultTimeout(10000);
  await page.route('**/api/admin/bridge', async route => {
   const {kind,name,args}=route.request().postDataJSON();
   assert.equal(kind,'query'); assert.equal(route.request().method(),'POST'); assert.deepEqual(args,{});
   const profiles=[{_id:'synthetic-male',name:'Synthetic Male',gender:'male',status:'approved',profileCompletionStatus:'completed',searchStatus:'active',publicApplicantNumber:901},{_id:'synthetic-female',name:'Synthetic Female',gender:'female',status:'approved',profileCompletionStatus:'completed',searchStatus:'active',publicApplicantNumber:902}];
   assert.equal(name,'registrations.getAll');
   await route.fulfill({json:{result:profiles}});
  });
  await page.route('**/api/admin/create-match',async route=>{assert.deepEqual(route.request().postDataJSON(),{maleRegistrationId:'synthetic-male',femaleRegistrationId:'synthetic-female',adminNotes:''});await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'An open match already exists for this pair. Open it in the workbench.'})});});
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.getByRole('button',{name:'New match',exact:true}).click();
  await page.getByRole('dialog',{name:'New match'}).waitFor();
  await page.screenshot({path:output+'/dialog-'+viewport.width+'.png'});
  assert.equal(await page.getByRole('button',{name:'Create match',exact:true}).isDisabled(),true);
  await page.getByLabel('Male applicant',{exact:true}).selectOption('synthetic-male');
  await page.getByLabel('Female applicant',{exact:true}).selectOption('synthetic-female');
  await page.getByRole('button',{name:'Create match',exact:true}).click();
  await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').innerText(),/open match already exists/);
  assert.equal(await page.getByLabel('Male applicant',{exact:true}).inputValue(),'synthetic-male');
  await page.unroute('**/api/admin/create-match');
  await page.route('**/api/admin/create-match',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({matchId:'synthetic-created-match'})}));
  await page.getByRole('button',{name:'Create match',exact:true}).click();
  await page.waitForFunction(()=>window.destination==='/admin/workbench?match=synthetic-created-match');
  assert.equal(await page.getByRole('dialog').count(),0);
  await page.getByRole('button',{name:'New match',exact:true}).click();
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(),0);
  assert.deepEqual(errors,[]); await page.close(); console.log('PASS real Topbar click, selection, error/retry, success, Escape: '+viewport.width);
 }
} finally {await browser.close();server.close();}
