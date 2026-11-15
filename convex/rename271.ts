import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./adminAuthorization";
import { assertNotSecurityRetired } from "./registrationSecurity";
import { assertNotArchived } from "./archiveRules";
// Exact user-authorized name correction. No email/auth/enrollment side effects.
export const rename = mutation({
 args:{adminSecret:v.string(),registrationId:v.id("registrations"),confirmNameCorrection:v.literal(true)},
 handler:async(ctx,args)=>{
  requireAdmin(args.adminSecret);
  const p=await ctx.db.get(args.registrationId);
  if(!p||p.publicApplicantNumber!==271)throw new Error("Only applicant271 authorized");
  assertNotSecurityRetired(p);assertNotArchived(p);
  if(p.name==="Aderi Ismaila")return {changed:false,name:p.name};
  if(p.name!=="Aderinsola (Aderi) Ismaila")throw new Error("Name changed; review current identity");
  await ctx.db.patch(p._id,{name:"Aderi Ismaila"});
  await ctx.db.insert("adminNameChangeAudits",{registrationId:p._id,oldName:p.name,newName:"Aderi Ismaila",actor:"authenticated_shared_admin",reason:"Layla authorized public271 name correction to Aderi Ismaila",createdAt:Date.now()});
  return {changed:true,name:"Aderi Ismaila"};
 }
});
