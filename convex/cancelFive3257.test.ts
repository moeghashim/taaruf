import { expect, test } from "vitest";
import { canonical, validateExactRows } from "./cancelFive3257";
const rows = [{"_creationTime":1794361219322.71,"_id":"m973rvsgvj096qwvfq05qn97yn8j1bp9","attempts":1,"createdAt":1794361219322,"error":"Isolated delivery configuration missing or recipient not allowlisted","interestId":"jn7exypvtxvsag6pagdgamhqkd8hz9wq","key":"jn7exypvtxvsag6pagdgamhqkd8hz9wq:sister_confirmation:j572w0f7mwazj4ke8snn0k99hn8g508t","kind":"sister_confirmation","nextAttemptAt":1794361362783,"recipientId":"j572w0f7mwazj4ke8snn0k99hn8g508t","status":"failed"},{"_creationTime":1794363171210.6924,"_id":"m97dn73sdhjb2x11hmb7m0kbq18j1a7a","attempts":1,"createdAt":1794363171210,"error":"Isolated delivery configuration missing or recipient not allowlisted","interestId":"jn7exypvtxvsag6pagdgamhqkd8hz9wq","key":"jn7exypvtxvsag6pagdgamhqkd8hz9wq:pending_review:j57fqgmbmh3am42geabkq852zx8g5wxy","kind":"pending_review","nextAttemptAt":1794363342797,"recipientId":"j57fqgmbmh3am42geabkq852zx8g5wxy","status":"failed"},{"_creationTime":1794363171210.6926,"_id":"m9723f97z7ss71sse5j40jp93x8j1v7h","attempts":1,"createdAt":1794363171210,"error":"Isolated delivery configuration missing or recipient not allowlisted","interestId":"jn7exypvtxvsag6pagdgamhqkd8hz9wq","key":"jn7exypvtxvsag6pagdgamhqkd8hz9wq:pending_review:j572w0f7mwazj4ke8snn0k99hn8g508t","kind":"pending_review","nextAttemptAt":1794363342797,"recipientId":"j572w0f7mwazj4ke8snn0k99hn8g508t","status":"failed"},{"_creationTime":1794363364339.8647,"_id":"m973rw67k9x943y3pqfx0jg9c18j0rry","attempts":1,"createdAt":1794363364339,"error":"Isolated delivery configuration missing or recipient not allowlisted","interestId":"jn7exypvtxvsag6pagdgamhqkd8hz9wq","key":"jn7exypvtxvsag6pagdgamhqkd8hz9wq:contacts_ready:j57fqgmbmh3am42geabkq852zx8g5wxy","kind":"contacts_ready","nextAttemptAt":1794363522830,"recipientId":"j57fqgmbmh3am42geabkq852zx8g5wxy","status":"failed"},{"_creationTime":1794363364339.865,"_id":"m970s3c83mxrx41s0898za0hvx8j0v6g","attempts":1,"createdAt":1794363364339,"error":"Isolated delivery configuration missing or recipient not allowlisted","interestId":"jn7exypvtxvsag6pagdgamhqkd8hz9wq","key":"jn7exypvtxvsag6pagdgamhqkd8hz9wq:contacts_ready:j572w0f7mwazj4ke8snn0k99hn8g508t","kind":"contacts_ready","nextAttemptAt":1794363522830,"recipientId":"j572w0f7mwazj4ke8snn0k99hn8g508t","status":"failed"}];
test("exact approved snapshot accepted independent of ordering",()=>{expect(()=>validateExactRows(rows)).not.toThrow();expect(()=>validateExactRows([...rows].reverse())).not.toThrow();});
test("canonical preserves every evidence field",()=>{expect(canonical({b:1,a:2})).toBe(canonical({a:2,b:1}));});
for(const field of ["status","attempts","error","interestId","recipientId","key","nextAttemptAt","createdAt","_creationTime","_id","firstAttemptAt","providerPayload","leaseUntil","sentAt","providerCooldownUntil"]) test("reject changed "+field,()=>{const changed=structuredClone(rows) as Record<string,unknown>[];changed[0][field]="changed";expect(()=>validateExactRows(changed)).toThrow("snapshot changed");});
test("reject missing extra or duplicate rows",()=>{for(const changed of [rows.slice(1),[...rows,rows[0]],[...rows.slice(1),rows[1]]])expect(()=>validateExactRows(changed)).toThrow();});

import { cancel } from "./cancelFive3257";
import type { MutationCtx } from "./_generated/server";
// Fixed production IDs cannot be inserted into convex-test's synthetic ID format.
// Exercise actual registered handler with a transactional staging harness instead.
async function exercise(options: { drift?: boolean; prior?: boolean; wrongPair?: boolean; wrongInterest?: boolean; extra?: boolean; failPatch?: number } = {}) {
  const staged: unknown[] = [], committed: unknown[] = [];
  let patches = 0;
  const db = {
    query: (table: string) => ({withIndex: () => table === "deliveryCancellationAudits" ? {unique:async()=>options.prior?{}:null} : {take:async()=>options.drift?rows.slice(1):options.extra?[...rows,rows[0]]:structuredClone(rows)}}),
    get: async (id: string) => id === "jn7exypvtxvsag6pagdgamhqkd8hz9wq" ? {fromRegistrationId:options.wrongInterest?"foreign":"j572w0f7mwazj4ke8snn0k99hn8g508t",toRegistrationId:"j57fqgmbmh3am42geabkq852zx8g5wxy"} : {publicApplicantNumber:options.wrongPair?999:id === "j572w0f7mwazj4ke8snn0k99hn8g508t"?220:219},
    insert:async(table:string,value:unknown)=>{staged.push({table,value});return "audit";},
    patch:async(id:string,patch:unknown)=>{if(++patches===options.failPatch)throw Error("injected failure");staged.push({id,patch});},
  };
  let error: unknown;
  try { await (cancel as unknown as {_handler:(ctx:MutationCtx,args:object)=>Promise<unknown>})._handler({db} as unknown as MutationCtx,{});committed.push(...staged); } catch(e){error=e;}
  return {staged,committed,error};
}
test("handler writes one complete audit and exactly five status-only patches",async()=>{
  const out=await exercise();expect(out.error).toBeUndefined();expect(out.committed).toHaveLength(6);
  const audit=out.committed[0] as {table:string,value:{snapshot:string}};
  expect(audit.table).toBe("deliveryCancellationAudits");expect(JSON.parse(audit.value.snapshot)).toEqual(rows);
  expect(out.committed.slice(1)).toEqual(rows.map(r=>({id:r._id,patch:{status:"cancelled"}})));
});
for(const options of [{drift:true},{prior:true},{wrongPair:true},{wrongInterest:true},{extra:true}])test("handler fails before writes: "+JSON.stringify(options),async()=>{const out=await exercise(options);expect(out.error).toBeTruthy();expect(out.staged).toEqual([]);});
test("transaction harness discards staged audit and patches on failure",async()=>{const out=await exercise({failPatch:3});expect(out.error).toBeTruthy();expect(out.committed).toEqual([]);});

import { preview } from "./adminPairTestReset";
import { vi } from "vitest";
import type { QueryCtx } from "./_generated/server";
test("post-cancellation preview is read-only and other unsafe delivery still blocks",async()=>{
  vi.stubEnv("ATTENDANCE_ADMIN_SECRET","synthetic");
  const pair=["j57fqgmbmh3am42geabkq852zx8g5wxy","j572w0f7mwazj4ke8snn0k99hn8g508t"];
  const id="jn7exypvtxvsag6pagdgamhqkd8hz9wq";
  const tables:Record<string,unknown[]>={registrations:pair.map((_id,i)=>({_id,publicApplicantNumber:219+i})),interests:[{_id:id,fromRegistrationId:pair[1],toRegistrationId:pair[0],source:"platform_submission"}],interestFlows:[{_id:"flow",interestId:id,fromRegistrationId:pair[1],toRegistrationId:pair[0],flowStatus:"closed"}],femaleWorkflowDeliveries:rows.map(r=>({...r,status:"cancelled"}))};
  const before=structuredClone(tables);
  const ctx={db:{query:(table:string)=>({take:async()=>tables[table]??[]})}} as unknown as QueryCtx;
  const handler=(preview as unknown as {_handler:(ctx:QueryCtx,args:{adminSecret:string})=>Promise<unknown>})._handler;
  try {
    await expect(handler(ctx,{adminSecret:"synthetic"})).resolves.toBeTruthy();expect(tables).toEqual(before);
    tables.femaleWorkflowDeliveries.push({...rows[0],_id:"other",status:"sending"});
    await expect(handler(ctx,{adminSecret:"synthetic"})).rejects.toThrow("manual reconciliation");
  } finally {vi.unstubAllEnvs();}
});
