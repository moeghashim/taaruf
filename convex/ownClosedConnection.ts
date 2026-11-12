import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx, MutationCtx } from "./_generated/server";

// History eligibility is a receipt, not a guess from status or propagated flags.
// Never return another participant's action (or the audit events) to applicants.
export async function ownClosedDecision(ctx: QueryCtx | MutationCtx, row: Doc<"interests">, flow: Doc<"interestFlows"> | null, viewer: Id<"registrations">): Promise<"declined" | "withdrawn" | null> {
  if (row.testReset || !flow || flow.interestId !== row._id || flow.fromRegistrationId !== row.fromRegistrationId || flow.toRegistrationId !== row.toRegistrationId || ![row.fromRegistrationId, row.toRegistrationId].includes(viewer)) return null;
  if (!["declined", "withdrawn"].includes(row.status)) return null;
  const events = await ctx.db.query("interestFlowEvents").withIndex("by_interestId", q => q.eq("interestId", row._id)).order("desc").take(1001);
  // Fail closed for oversized/ambiguous legacy histories; audit remains intact.
  if (events.length > 1000) return null;
  const lifecycle = events.filter(e => e.interestFlowId === flow._id && /reopen|reset|revok|expir|clos|declin|withdraw/.test(e.eventType));
  const latestAt = Math.max(flow.createdAt, ...lifecycle.map(e => e.createdAt));
  // The latest closure must be attributable to this viewer alone. Tied or
  // later admin/counterpart/lifecycle records are ambiguous and fail closed.
  const latest = lifecycle.filter(e => e.createdAt === latestAt);
  if (!latest.length || latest.some(e => e.actor !== "applicant" || e.actorRegistrationId !== viewer || !["inbound_declined", "final_approval_declined", "outbound_withdrawn"].includes(e.eventType))) return null;
  const own = latest;
  if (row.status === "withdrawn" && row.fromRegistrationId === viewer && flow.flowStatus === "closed" && flow.closedReason === "requester_withdrew" && own.some(e => e.eventType === "outbound_withdrawn")) return "withdrawn";
  if (row.status !== "declined" || flow.flowStatus !== "declined") return null;
  if (row.toRegistrationId === viewer && flow.recipientDecision === "declined" && own.some(e => e.eventType === "inbound_declined")) return "declined";
  const final = row.fromRegistrationId === viewer ? flow.requesterFinalApproval : flow.recipientFinalApproval;
  const finalAt = row.fromRegistrationId === viewer ? flow.requesterFinalApprovalAt : flow.recipientFinalApprovalAt;
  return final === "declined" && own.some(e => e.eventType === "final_approval_declined" && e.createdAt === finalAt) ? "declined" : null;
}
