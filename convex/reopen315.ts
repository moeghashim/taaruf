import { mutation, query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { hash } from "fast-sha256";
import { requireAdmin } from "./adminAuthorization";
import type { Id } from "./_generated/dataModel";

// One approved submission, never a general reset or caller-selected target.
export const TARGET = "jn70ymh9a2n5vbz5w1xkv7gfe18j0znx" as Id<"interests">;
const SISTER = "j573g9z3ynhnvm0szxxen85ngx8j0vxx" as Id<"registrations">;
const BROTHER = "j571mzmn1fpw9c8pddz9rp63q98fye2j" as Id<"registrations">;
const EVENT = "kd71abx4ysgak9cc9k43fppyvd8gtfer" as Id<"events">;
const OPERATION = "reopen-sister315-admin217-nov14-3462";
function canonical(x: unknown): string {
  if (Array.isArray(x)) return "[" + x.map(canonical).join(",") + "]";
  if (x && typeof x === "object") return "{" + Object.entries(x).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+":"+canonical(v)).join(",") + "}";
  return JSON.stringify(x);
}
export function fingerprint(x: unknown) { return Array.from(hash(new TextEncoder().encode(canonical(x))), b=>b.toString(16).padStart(2,"0")).join(""); }
async function snapshot(ctx: QueryCtx) {
  const sister = await ctx.db.get(SISTER), brother = await ctx.db.get(BROTHER), event = await ctx.db.get(EVENT);
  if (sister?.publicApplicantNumber !== 315 || sister.name !== "sister test" || sister.gender !== "female" || brother?.publicApplicantNumber !== 217 || brother.name !== "Admin Test" || brother.gender !== "male" || event?.startsAt !== 1794681900000 || event.eventCode !== "nov26") throw new Error("Configured scope changed");
  const interest = await ctx.db.get(TARGET);
  if (!interest || interest.fromRegistrationId !== SISTER || interest.toRegistrationId !== BROTHER || interest.eventId !== EVENT || interest.source !== "platform_submission" || interest.testReset || interest.matchId || interest.status !== "closed" || interest.adminStatus !== "pending" || interest.visibility !== "internal_only") throw new Error("Submission state changed");
  const workflow = interest.femaleWorkflow;
  if (!workflow || workflow.state !== "revoked" || Object.keys(workflow).some(k=>!["state","reviewExpiresAt"].includes(k))) throw new Error("Review state changed");
  const flows = await ctx.db.query("interestFlows").withIndex("by_interestId",q=>q.eq("interestId",TARGET)).take(2);
  const flow = flows[0];
  const allowed = ["_id","_creationTime","interestId","fromRegistrationId","toRegistrationId","flowStatus","recipientDecision","requesterFinalApproval","recipientFinalApproval","photoDecision","createdAt","updatedAt"];
  if (flows.length !== 1 || flow.fromRegistrationId !== SISTER || flow.toRegistrationId !== BROTHER || flow.flowStatus !== "private_documented" || [flow.recipientDecision,flow.requesterFinalApproval,flow.recipientFinalApproval,flow.photoDecision].some(x=>x!=="pending") || Object.keys(flow).some(k=>!allowed.includes(k))) throw new Error("Approval or disclosure state changed");
  // Full bounded scans also catch malformed foreign references. No rows are changed.
  const matches = await ctx.db.query("matches").take(1001);
  const shares = await ctx.db.query("profileShares").take(1001);
  if (matches.length > 1000 || shares.length > 1000 || matches.some(m=>m.interestId===TARGET) || shares.some(s=>s.interestId===TARGET)) throw new Error("Linked records require review");
  const deliveries = await ctx.db.query("femaleWorkflowDeliveries").withIndex("by_interestId",q=>q.eq("interestId",TARGET)).take(101);
  if (deliveries.length > 100 || deliveries.some(d=>d.status!=="failed" || d.attempts!==0 || d.firstAttemptAt!==undefined || d.leaseUntil!==undefined || d.providerPayload!==undefined || d.kind!=="brother_review" || d.recipientId!==BROTHER)) throw new Error("Delivery state changed");
  const history = await ctx.db.query("interestFlowEvents").withIndex("by_interestId",q=>q.eq("interestId",TARGET)).take(101);
  if (history.length > 100) throw new Error("History limit exceeded");
  const state = { interest, flow, deliveries, history };
  if (new TextEncoder().encode(canonical(state)).length > 200000) throw new Error("Audit size limit exceeded");
  return {state,fingerprint:fingerprint(state)};
}
export const preview = query({args:{adminSecret:v.string()},handler:async(ctx,args)=>{
  requireAdmin(args.adminSecret);
  const prior = await ctx.db.query("interestReopenAudits").withIndex("by_operationKey",q=>q.eq("operationKey",OPERATION)).unique();
  if (prior) return {alreadyApplied:true,auditId:prior._id,operationKey:OPERATION};
  const s=await snapshot(ctx);
  return {alreadyApplied:false,operationKey:OPERATION,interestId:TARGET,fingerprint:s.fingerprint,effect:"Restore this submission to private pending review; existing reciprocal profile access stays unchanged. No emails, tokens, contacts or resets."};
}});
export const reopen = mutation({args:{adminSecret:v.string(),expectedFingerprint:v.string(),confirm:v.literal("315-to-217-nov14")},handler:async(ctx,args)=>{
  requireAdmin(args.adminSecret);
  const prior=await ctx.db.query("interestReopenAudits").withIndex("by_operationKey",q=>q.eq("operationKey",OPERATION)).unique();
  if(prior){if(prior.fingerprint!==args.expectedFingerprint)throw new Error("Preview changed");return {alreadyApplied:true,auditId:prior._id,operationKey:OPERATION};}
  const s=await snapshot(ctx);
  if(s.fingerprint!==args.expectedFingerprint)throw new Error("Preview changed");
  const now=Date.now();
  const auditId=await ctx.db.insert("interestReopenAudits",{operationKey:OPERATION,interestId:TARGET,fingerprint:s.fingerprint,snapshot:canonical(s.state),actor:"admin",reason:"Layla approved scoped reopen for reciprocal-interest testing; preserve existing profile access and notification history",createdAt:now});
  await ctx.db.patch(TARGET,{status:"new",femaleWorkflow:{state:"private_documented"},updatedAt:now});
  await ctx.db.insert("interestFlowEvents",{interestId:TARGET,interestFlowId:s.state.flow._id,actor:"admin",eventType:"admin_submission_reopened",message:"Scoped reopen to private pending review; existing profile shares and delivery history unchanged",createdAt:now});
  return {alreadyApplied:false,auditId,operationKey:OPERATION};
}});
