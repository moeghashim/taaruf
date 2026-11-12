/** Read-only production dry-run. Builds the exact local planner into a one-off QUERY;
 * never deploys modules or invokes a mutation. stdout contains counts/hash, no PII.
 * Usage: node scripts/merge4358-dry-run.mjs /absolute/configured/project
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {build} from 'esbuild';
const root=path.resolve(import.meta.dirname,'..');
const project=process.argv[2];
if(!project || !path.isAbsolute(project)) throw Error('Explicit configured project path required');
const bundle=await build({stdin:{contents:'export { plan, MERGE_PAIR } from "./convex/registrationMerge.ts";',resolveDir:root,loader:'ts'},bundle:true,write:false,format:'iife',globalName:'mergePlanner',platform:'browser',target:'es2022'});
const query='import {query} from "convex:/_system/repl/wrappers.js";\n'+bundle.outputFiles[0].text+'\nexport default query({handler:async ctx=>{const p=await mergePlanner.plan(ctx,mergePlanner.MERGE_PAIR,"retain_target");return {fingerprint:p.fingerprint,counts:p.counts,proposedWrites:p.writes.length,conflicts:p.conflicts,blockers:p.blockers,policy:"retain_target",authorizationReference:"Layla4381; application4403; separate release gate pending",writeSummary:p.writes.map(w=>({table:w.table,id:w.id,fields:Object.keys(w.patch)})),productionAuthorized:false}}});';
const cli=path.join(project,'node_modules/.bin/convex');
const child=spawn(cli,['mcp','start'],{cwd:project,stdio:['pipe','pipe','pipe']});
let seq=0,buffer='';const pending=new Map();
child.stdout.on('data',data=>{buffer+=data;let at;while((at=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,at);buffer=buffer.slice(at+1);try{const response=JSON.parse(line);const resolve=pending.get(response.id);if(resolve){pending.delete(response.id);resolve(response);}}catch{}}});
const rpc=(method,params)=>new Promise(resolve=>{const id=++seq;pending.set(id,resolve);child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
const timeout=setTimeout(()=>{child.kill();process.exitCode=1;console.error('Read-only query timed out');},120000);
try{
 await rpc('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'merge4358-readonly',version:'1'}});
 child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
 const status=await rpc('tools/call',{name:'status',arguments:{projectDir:project}});
 const parsed=JSON.parse(status.result.content.filter(x=>x.type==='text').map(x=>x.text).join(''));
 const deployment=parsed.availableDeployments.find(d=>new URL(d.url).hostname==='clever-meerkat-940.eu-west-1.convex.cloud');
 if(!deployment) throw Error('Expected live read-only deployment unavailable: '+JSON.stringify(parsed.availableDeployments.map(d=>({url:d.url}))));
 const result=await rpc('tools/call',{name:'runOneoffQuery',arguments:{deploymentSelector:deployment.deploymentSelector,query}});
 if(result.error || result.result?.isError) throw Error(JSON.stringify(result));
 await fs.mkdir(path.join(root,'evidence/merge4358'),{recursive:true});
 await fs.writeFile(path.join(root,'evidence/merge4358/dry-run.json'),JSON.stringify(result,null,2),{mode:0o600});
 console.log(JSON.stringify(result,null,2));
}finally{clearTimeout(timeout);child.kill();}
