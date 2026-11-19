import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { MutationCtx } from "./_generated/server";
import { clearObsoletePointers } from "./repairClosedMatch6469";

const F18 = "j57ekj8fxrjezvdkt7htveb1m183ztyc";
const M96 = "j57a6d4r3y358yep0wyf9vbth1848m1w";
const F74 = "j57abxkz9yvhd6h9sz9ahhsmgs844d2q";
const M127 = "j579s66m5k8aag4spymvccnw9s84gjzb";
const CLOSED = "jd71jx6gmaagd5yddcwcyrjhgn84w9sr";
const DECLINED = "jd75qmbp3e2a1bwmmh79fsmcf58546sq";
type Row = Record<string, unknown> & { _id: string };
beforeEach(() => vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "synthetic"));
afterEach(() => vi.unstubAllEnvs());
function fixture() {
  const profiles: Row[] = [[18,F18,"female",CLOSED],[96,M96,"male",CLOSED],[74,F74,"female",DECLINED],[127,M127,"male",undefined]].map(([number,id,gender,activeMatchId]) => ({_id:String(id), publicApplicantNumber:number, gender, activeMatchId, status:"approved", profileCompletionStatus:"completed", searchStatus:"active", updatedAt:123, consent:"pending", privateNotes:"preserve"}));
  const matches: Row[] = [{_id:CLOSED,maleRegistrationId:M96,femaleRegistrationId:F18,status:"closed",updatedAt:1},{_id:DECLINED,maleRegistrationId:M127,femaleRegistrationId:F74,status:"declined",updatedAt:2}];
  const state = {profiles,matches,interests:[{status:"queued"}],flows:[{requesterFinalApproval:"approved",recipientFinalApproval:"pending"}],history:[{decision:"declined"}],deliveries:[{status:"pending"}]};
  const patch = vi.fn(async (id:string, fields:object) => {const row=profiles.find(r=>r._id===id);if(!row)throw Error("Missing patch target");for(const [key,value] of Object.entries(fields)){if(value===undefined)delete row[key];else row[key]=value;}});
  const normalizeId=vi.fn((_table:string,id:string)=>id as string|null);
  const query=vi.fn((table:string)=>({withIndex:(index:string,cb:(q:unknown)=>unknown)=>{let key="",value:unknown;cb({eq:(k:string,v:unknown)=>{key=k;value=v;}});expect(index).toBe("by_"+key);const rows=()=> (table==="registrations"?profiles:state.matches).filter(r=>r[key]===value);return {unique:async()=>{if(rows().length>1)throw Error("Duplicate canonical number");return rows()[0]??null;},take:async(n:number)=>rows().slice(0,n)};}}));
  const ctx={db:{query,normalizeId,get:async(id:string)=>state.matches.find(m=>m._id===id)??null,patch}} as unknown as MutationCtx;
  const run=(secret="synthetic") => (clearObsoletePointers as unknown as {_handler:(ctx:MutationCtx,args:{adminSecret:string;confirmRepair6469:true})=>Promise<{changedNumbers:number[]}>})._handler(ctx,{adminSecret:secret,confirmRepair6469:true});
  return {state,patch,query,normalizeId,run};
}
test("exact three IDs: only pointers removed; consent/history/all other fields unchanged; repeat no-op",async()=>{
  const f=fixture(),before=structuredClone(f.state);
  expect(await f.run()).toEqual({changedNumbers:[18,96,74]});
  for(const row of before.profiles.slice(0,3))delete row.activeMatchId;
  expect(f.state).toEqual(before);
  expect(f.patch.mock.calls).toEqual([F18,M96,F74].map(id=>[id,{activeMatchId:undefined}]));
  expect(await f.run()).toEqual({changedNumbers:[]});expect(f.patch).toHaveBeenCalledTimes(3);expect(f.state).toEqual(before);
});
test("already repaired subset is skipped, never broadens scope",async()=>{const f=fixture();delete f.state.profiles[1].activeMatchId;expect(await f.run()).toEqual({changedNumbers:[18,74]});expect(f.patch.mock.calls.map(c=>c[0])).toEqual([F18,F74]);});
test("internal only and bad/missing configured credentials deny before reads",async()=>{expect(clearObsoletePointers.isInternal).toBe(true);for(const secret of ["wrong",""]){const f=fixture();await expect(f.run(secret)).rejects.toThrow("Unauthorized");expect(f.query).not.toHaveBeenCalled();expect(f.patch).not.toHaveBeenCalled();}vi.stubEnv("ATTENDANCE_ADMIN_SECRET","");const f=fixture();await expect(f.run()).rejects.toThrow("Unauthorized");expect(f.patch).not.toHaveBeenCalled();});
const guards = ["identity","gender","missingProfile","duplicate","pointerChanged","nullPointer","missingMatch","invalidMatchId","foreignMale","foreignFemale","terminalChanged","resetMatch","counterpart","archived","retired","merged","paused","inactive","unapproved","incomplete"] as const;
test.each(guards)("last target %s aborts ALL three before any write",async condition=>{
 const f=fixture(),p=f.state.profiles[2],m=f.state.matches[1];
 switch(condition){case "identity":p._id="foreign";break;case "gender":p.gender="male";break;case "missingProfile":f.state.profiles.splice(2,1);break;case "duplicate":f.state.profiles.push({...p});break;case "pointerChanged":p.activeMatchId="new-match";break;case "nullPointer":p.activeMatchId=null;break;case "missingMatch":f.state.matches.pop();break;case "invalidMatchId":f.normalizeId.mockImplementation((_t,id)=>id===DECLINED?null:id);break;case "foreignMale":m.maleRegistrationId=M96;break;case "foreignFemale":m.femaleRegistrationId=F18;break;case "terminalChanged":m.status="closed";break;case "resetMatch":m.testResetAt=0;break;case "counterpart":f.state.profiles[3]._id="foreign";break;case "archived":p.archivedAt=0;break;case "retired":p.securityRetiredAt=0;break;case "merged":p.mergedIntoRegistrationId="foreign";break;case "paused":p.searchStatus="paused";break;case "inactive":p.searchStatus="inactive";break;case "unapproved":p.status="pending";break;case "incomplete":p.profileCompletionStatus="in_progress";break;}
 const before=structuredClone(f.state);await expect(f.run()).rejects.toThrow();expect(f.patch).not.toHaveBeenCalled();expect(f.state).toEqual(before);
});
test.each(["maleRegistrationId","femaleRegistrationId"])("either-side index %s rejects every nonterminal status, including reset/draft",async side=>{for(const status of ["new","reviewing","contact_shared","paused","draft"]){const f=fixture();f.state.matches.push({_id:"competing",maleRegistrationId:M127,femaleRegistrationId:F18,[side]:F74,status,testResetAt:1});const before=structuredClone(f.state);await expect(f.run()).rejects.toThrow("Competing nonterminal");expect(f.patch).not.toHaveBeenCalled();expect(f.state).toEqual(before);}});
test.each(["maleRegistrationId","femaleRegistrationId"])("%s bounded history overflow fails closed",async side=>{const f=fixture();f.state.matches.push(...Array.from({length:1001},(_,i)=>({_id:"history"+i,[side]:F74,status:"closed"})));await expect(f.run()).rejects.toThrow("History overflow");expect(f.patch).not.toHaveBeenCalled();});
test("exact 1000 rows is allowed; unrelated active rows are not mistaken for target matches",async()=>{const f=fixture();f.state.matches.push(...Array.from({length:999},(_,i)=>({_id:"history"+i,femaleRegistrationId:F74,status:"closed"})),{_id:"unrelated",maleRegistrationId:"other",femaleRegistrationId:"another",status:"reviewing"});expect(await f.run()).toEqual({changedNumbers:[18,96,74]});});
test("absent legacy search status remains active",async()=>{const f=fixture();for(const p of f.state.profiles)delete p.searchStatus;expect(await f.run()).toEqual({changedNumbers:[18,96,74]});});
test("repeat rechecks competing history even with every pointer absent",async()=>{const f=fixture();await f.run();f.patch.mockClear();f.state.matches.push({_id:"new",maleRegistrationId:F74,status:"reviewing"});await expect(f.run()).rejects.toThrow("Competing nonterminal");expect(f.patch).not.toHaveBeenCalled();});
