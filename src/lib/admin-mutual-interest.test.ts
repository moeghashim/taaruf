import { expect, test, vi } from "vitest";
import { adminMutualInterests } from "./admin-mutual-interest";
import type { ConvexHttpClient } from "convex/browser";
const people = [{_id:"a"},{_id:"b"}];
const m = {_id:"m",interestId:"i",maleRegistrationId:"a",femaleRegistrationId:"b",status:"closed"};
const row = (reverse=false) => ({_id:reverse?"r":"i",fromRegistrationId:reverse?"b":"a",toRegistrationId:reverse?"a":"b",eventId:"e",event:{_id:"e",status:"completed"},fromRegistration:people[reverse?1:0],toRegistration:people[reverse?0:1],match:m,matchId:"m",status:"closed",createdAt:1,source:reverse?"whatsapp":"email"});
const page=(rows: unknown[])=>({page:rows,isDone:true,continueCursor:""});
test.each(["closed","paused"])("legacy timestamp-only %s history needs validated directed flow", async status=>{
 const query=vi.fn().mockResolvedValueOnce(page([row(),{...row(true),match:{...m,status}}])).mockResolvedValueOnce(page([{interestId:"i",fromRegistrationId:"a",toRegistrationId:"b",contactSharedAt:2}]));
 const result=await adminMutualInterests({consistentQuery:query} as unknown as ConvexHttpClient,"test");
 expect(result.map(i=>i.mutual?.state)).toEqual(["completed","completed"]);
 expect(query).toHaveBeenCalledTimes(2);
});
test("mismatched legacy flow never invents completion",async()=>{
 const query=vi.fn().mockResolvedValueOnce(page([row(),row(true)])).mockResolvedValueOnce(page([{interestId:"i",fromRegistrationId:"x",toRegistrationId:"b",contactSharedAt:2}]));
 expect((await adminMutualInterests({consistentQuery:query} as unknown as ConvexHttpClient,"test")).every(i=>i.mutual===null)).toBe(true);
});
test("aborted request does not start another page",async()=>{
 const controller=new AbortController();controller.abort();const query=vi.fn();
 await expect(adminMutualInterests({consistentQuery:query} as unknown as ConvexHttpClient,"test",controller.signal)).rejects.toThrow();expect(query).not.toHaveBeenCalled();
});
test("1006 duplicate interests serialize bounded two-direction evidence per row",async()=>{
 const rows=Array.from({length:1005},(_,n)=>({...row(),_id:String(n),status:"new",match:null,matchId:undefined}));rows.push({...row(true),status:"new",match:null,matchId:undefined});
 const query=vi.fn().mockResolvedValueOnce(page(rows)).mockResolvedValueOnce(page([]));
 const result=await adminMutualInterests({consistentQuery:query} as unknown as ConvexHttpClient,"test");
 expect(result.every(i=>i.mutual?.submissions.length===2)).toBe(true);expect(JSON.stringify(result).length).toBeLessThan(1000000);
});
