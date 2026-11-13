import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
afterEach(() => vi.unstubAllEnvs());
async function fixture() {
 vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "synthetic-birthday-admin");
 const t = convexTest(schema, modules);
 const id = await t.mutation(api.registrations.create, {adminSecret:"synthetic-birthday-admin",name:"Synthetic",age:30,gender:"female",maritalStatus:"single",education:"College",job:"Test",phone:"5550100",email:"dob@example.invalid"});
 return {t,id};
}
test("DOB reader rejects missing/wrong admin authentication and missing configuration",async()=>{
 const {t,id}=await fixture();
 for(const adminSecret of [undefined,"","wrong"]){await expect(t.query(api.adminBirthday.get,{registrationId:id,adminSecret})).rejects.toThrow("Unauthorized");}
 vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "");
 await expect(t.query(api.adminBirthday.get,{registrationId:id,adminSecret:"synthetic-birthday-admin"})).rejects.toThrow("Unauthorized");
});
test("authorized detail returns only recorded birthday; absent/deleted profiles return null; reads do not write",async()=>{
 const {t,id}=await fixture();const args={registrationId:id,adminSecret:"synthetic-birthday-admin"};
 expect(await t.query(api.adminBirthday.get,args)).toBeNull();
 await t.run(ctx=>ctx.db.insert("registrationBirthdays",{registrationId:id,dateOfBirth:"2000-02-29"}));
 const before=await t.run(ctx=>ctx.db.get(id));
 const privateBefore=await t.run(ctx=>ctx.db.query("registrationBirthdays").collect());
 expect(await t.query(api.adminBirthday.get,args)).toEqual({dateOfBirth:"2000-02-29"});
 expect(await t.run(ctx=>ctx.db.get(id))).toEqual(before);
 expect(await t.run(ctx=>ctx.db.query("registrationBirthdays").collect())).toEqual(privateBefore);
 await t.run(ctx=>ctx.db.delete(id));expect(await t.query(api.adminBirthday.get,args)).toBeNull();
});
test("adding admin detail reader does not add DOB to admin list/general single-record responses",async()=>{
 const {t,id}=await fixture();await t.run(ctx=>ctx.db.insert("registrationBirthdays",{registrationId:id,dateOfBirth:"2000-02-29"}));
 for(const value of [await t.query(api.registrations.getAll,{adminSecret:"synthetic-birthday-admin"}),await t.query(api.registrations.getById,{id,adminSecret:"synthetic-birthday-admin"})]){
 expect(JSON.stringify(value)).not.toContain("dateOfBirth");expect(JSON.stringify(value)).not.toContain("2000-02-29");
 }
});
