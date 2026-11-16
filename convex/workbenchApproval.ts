import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

export type WorkbenchFinalApprovals = {
  requester: Doc<"interestFlows">["requesterFinalApproval"];
  recipient: Doc<"interestFlows">["recipientFinalApproval"];
};

/** Read-only admin projection. Never turn initial acceptance into final consent.
 * Match the participant portal's treatment of legacy ambiguous brother approvals.
 * Missing/invalid evidence stays unknown, not a fabricated pending decision. */
export async function workbenchFinalApprovals(ctx: QueryCtx, interest: Doc<"interests">): Promise<WorkbenchFinalApprovals | null> {
  if (interest.femaleWorkflow?.state !== "awaiting_sister_confirmation") return null;
  const flow = await ctx.db.query("interestFlows").withIndex("by_interestId", q => q.eq("interestId", interest._id)).unique();
  if (!flow || flow.fromRegistrationId !== interest.fromRegistrationId || flow.toRegistrationId !== interest.toRegistrationId || ["closed", "declined"].includes(flow.flowStatus)) return null;
  return {
    requester: flow.requesterFinalApproval,
    recipient: !interest.matchId && flow.recipientFinalApproval === "approved" && flow.recipientExplicitFinalAt === undefined ? "pending" : flow.recipientFinalApproval,
  };
}
