import { v } from "convex/values";
import { internalMutation, internalAction, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { deliveryConfig } from "./femaleWorkflowDelivery";
import { assertParticipantsAvailable, contactsVisible, linkedFlows } from "./contactGate";
export const ACTIVATION_KEY = "contactReleaseEmailActivatedAt";
export const enabled = () => process.env.CONTACT_RELEASE_EMAIL_ENABLED === "true";
async function activation(ctx: MutationCtx | QueryCtx) {
 const s = await ctx.db.query("settings").withIndex("by_key", q => q.eq("key", ACTIVATION_KEY)).unique();
 const at = Number(s?.value); return s && Number.isSafeInteger(at) && at > 0 && at <= Date.now() ? at : null;
}
export const activate = internalMutation({args:{},handler:async ctx=>{
 if (!enabled() || process.env.FEMALE_WORKFLOW_PRODUCTION_APPROVED !== "true" || !deliveryConfig("activation@example.invalid")) throw Error("Contact email production configuration missing");
 const old=await activation(ctx); if(old!==null)return old;
 const existing=await ctx.db.query("settings").withIndex("by_key",q=>q.eq("key",ACTIVATION_KEY)).unique(); if(existing)throw Error("Invalid immutable activation");
 const at=Date.now();await ctx.db.insert("settings",{key:ACTIVATION_KEY,value:String(at)});return at;
}});
/** Only invoked inside the first real contact-release transaction. */
export async function enqueueReleasedContacts(ctx:MutationCtx,matchId:Id<"matches">){
 const m=(await ctx.db.get(matchId))!;const at=await activation(ctx),now=Date.now();
 for(const recipientId of [m.maleRegistrationId,m.femaleRegistrationId]){
  const key="contacts-ready:"+matchId+":"+recipientId;
  if(await ctx.db.query("contactReleaseEmails").withIndex("by_key",q=>q.eq("key",key)).unique())continue;
  const p=await ctx.db.get(recipientId);
  const ready=enabled()&&process.env.FEMALE_WORKFLOW_PRODUCTION_APPROVED === "true"&&at!==null&&m.adminReleasedAt!==undefined&&m.adminReleasedAt>at&&now>at&&!!p&&!!deliveryConfig(p.email);
  await ctx.db.insert("contactReleaseEmails",{matchId,recipientId,key,email:p?.email??"",releaseAt:m.adminReleasedAt??0,activationAt:at??0,createdAt:now,status:ready?"pending":"failed",attempts:0,nextAttemptAt:now,...(ready?{}:{error:"Not activated at first contact release; no backfill"})});
 }
}
async function eligible(ctx:MutationCtx,row:Doc<"contactReleaseEmails">){
 const at=await activation(ctx);if(!enabled()||process.env.FEMALE_WORKFLOW_PRODUCTION_APPROVED !== "true"||Date.now()-row.createdAt>=23*3600000||at===null||row.activationAt!==at||row.createdAt<=at||row.releaseAt<=at)throw Error("Contact activation boundary");
 const m=await ctx.db.get(row.matchId);
 if(!m||m.testResetAt!==undefined||m.matchmakerWithdrawnAt!==undefined||["closed","declined","paused"].includes(m.status)||m.contactGate!=="contacts_released"||m.adminReleasedAt!==row.releaseAt)throw Error("Contacts unavailable");
 const {male,female}=await assertParticipantsAvailable(ctx,m.maleRegistrationId,m.femaleRegistrationId,m._id);
 if(m.interestId){const i=await ctx.db.get(m.interestId);if(!i||i.testReset||["closed","declined","withdrawn"].includes(i.status))throw Error("Interest unavailable");const flows=await linkedFlows(ctx,i);if(!flows.length||!await contactsVisible(ctx,i,flows.find(f=>f.interestId===i._id)??null))throw Error("Contacts revoked");if(i.femaleWorkflow&&["revoked","declined"].includes(i.femaleWorkflow.state))throw Error("Review revoked");}
 else if(m.matchmakerPresentedAt===undefined||m.maleMatchmakerApprovalAt===undefined||m.femaleMatchmakerApprovalAt===undefined)throw Error("Matchmaker approval missing");
 const p=[male,female].find(p=>p._id===row.recipientId);if(!p||p.email!==row.email)throw Error("Recipient changed");
 const config=deliveryConfig(p.email);if(!config)throw Error("Delivery configuration unavailable");
 return config;
}
export const claim=internalMutation({args:{},handler:async ctx=>{
 if(!enabled())return [];
 const now=Date.now();const cooldown=await ctx.db.query("contactReleaseEmails").withIndex("by_cooldown").order("desc").first();if((cooldown?.cooldownUntil??0)>now)return [];
 const rows=(await Promise.all((["pending","sending"] as const).map(status=>ctx.db.query("contactReleaseEmails").withIndex("by_status_due",q=>q.eq("status",status).lte("nextAttemptAt",now)).take(10)))).flat();const claimed=[];
 for(const row of rows.slice(0,10)){try{const config=await eligible(ctx,row);if(row.attempts>=6||(row.firstAttemptAt!==undefined&&now-row.firstAttemptAt>=23*3600000))throw Error("Idempotency window expired");if(row.payload&&row.payload.from!==config.from)throw Error("Sender changed");const attempt=row.attempts+1;await ctx.db.patch(row._id,{status:"sending",attempts:attempt,nextAttemptAt:now+120000,leaseUntil:now+120000});claimed.push({id:row._id,attempt});}catch{await ctx.db.patch(row._id,{status:"failed",error:"No longer authorized; no automatic replay"});}}
 return claimed;
}});
export const authorize=internalMutation({args:{id:v.id("contactReleaseEmails"),attempt:v.number()},handler:async(ctx,args)=>{
 const row=await ctx.db.get(args.id);if(!row||row.status!=="sending"||row.attempts!==args.attempt||!row.leaseUntil||row.leaseUntil<=Date.now())return null;
 try{const config=await eligible(ctx,row);const cooldown=await ctx.db.query("contactReleaseEmails").withIndex("by_cooldown").order("desc").first();if((cooldown?.cooldownUntil??0)>Date.now())return null;
 const portal = new URL("/me",config.portal).toString();
 const text = "Assalamu alaikum!\n\nAlhamdulillah, a match has been created for you, and your contact details have now been shared with each other!\n\nSign in to your portal to view your match’s contact details and take the next step:\nhttps://www.1plus1match.com/me\n\nMay Allah place barakah in this connection and guide you both toward what is best. We’re excited for you!\n\nThe 1 Plus 1 Team".replace("https://www.1plus1match.com/me",portal);
 const escapeHtml = (value:string) => value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
 const html = text.split("\n\n").map(paragraph=>"<p>"+escapeHtml(paragraph).replace(escapeHtml(portal),'<a href="'+escapeHtml(portal)+'">'+escapeHtml(portal)+'</a>').replace(/\n/g,"<br>")+"</p>").join("\n");
 const payload=row.payload??{from:config.from,to:[row.email],subject:"Alhamdulillah — you have a match! 🎉",text,html};
 if(payload.from!==config.from||payload.to.length!==1||payload.to[0]!==row.email)throw Error("Frozen payload mismatch");
 await ctx.db.patch(row._id,{payload,firstAttemptAt:row.firstAttemptAt??Date.now(),leaseUntil:Date.now()+120000,nextAttemptAt:Date.now()+120000});return {payload,key:row.key};
 }catch{await ctx.db.patch(row._id,{status:"cancelled",error:"Contacts or recipient no longer available"});return null;}
}});
export const finish=internalMutation({args:{id:v.id("contactReleaseEmails"),attempt:v.number(),ok:v.boolean(),retry:v.boolean(),cooldownMs:v.number(),providerId:v.optional(v.string())},handler:async(ctx,a)=>{
 const r=await ctx.db.get(a.id);if(!r||r.attempts!==a.attempt||r.status!=="sending")return;
 const delay=Math.max(a.cooldownMs,60000*2**r.attempts);await ctx.db.patch(r._id,{status:a.ok?"sent":a.retry&&r.attempts<6?"pending":"failed",nextAttemptAt:Date.now()+delay,...(a.cooldownMs?{cooldownUntil:Date.now()+a.cooldownMs}:{}),...(a.ok?{sentAt:Date.now(),providerId:a.providerId}:{}),leaseUntil:undefined});
}});
export const drain=internalAction({args:{},handler:async ctx=>{
 const rows: Array<{id:Id<"contactReleaseEmails">;attempt:number}>=await ctx.runMutation(internal.contactReleaseEmail.claim,{});
 for(const row of rows){const delivery=await ctx.runMutation(internal.contactReleaseEmail.authorize,row);if(!delivery)continue;const config=deliveryConfig(delivery.payload.to[0]);if(!config)continue;
 try{const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+config.key,"Content-Type":"application/json","Idempotency-Key":delivery.key},body:JSON.stringify(delivery.payload),signal:AbortSignal.timeout(15000)});const data = r.ok ? await r.json().catch(()=>null) : null; const accepted = r.ok && typeof data?.id === "string"; const retryAfter=r.headers.get("retry-after");const raw=retryAfter?(/^\d+$/.test(retryAfter)?Number(retryAfter)*1000:Date.parse(retryAfter)-Date.now()):0;const cooldownMs=r.status===429?Math.max(60000,Number.isFinite(raw)?raw:0):0;await ctx.runMutation(internal.contactReleaseEmail.finish,{...row,ok:accepted,retry:r.ok&&!accepted||r.status===409||r.status===429||r.status>=500,cooldownMs,...(accepted?{providerId:data.id}:{})});if(r.status===429)break;
 }catch{await ctx.runMutation(internal.contactReleaseEmail.finish,{...row,ok:false,retry:true,cooldownMs:0});}}
}});
