import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { assertMatchInterest } from "./contactGate";

/** Initial acceptance belongs to this exact interest, never its reverse or another event.
 * Final approvals, bioVisibleAt and contact release are not initial consent.
 */
export async function interestBioVisible(
  ctx: QueryCtx | MutationCtx,
  interest: Doc<"interests">,
): Promise<boolean> {
  if (interest.canonicalInterestId || interest.testReset || interest.fromRegistrationId === interest.toRegistrationId ||
      ["closed", "declined", "withdrawn"].includes(interest.status)) return false;
  const workflow = interest.femaleWorkflow;
  if (workflow && ["private_documented", "awaiting_brother_review", "declined", "revoked"].includes(workflow.state)) return false;
  const flow = await ctx.db.query("interestFlows")
    .withIndex("by_interestId", q => q.eq("interestId", interest._id)).unique();
  if (!flow || flow.fromRegistrationId !== interest.fromRegistrationId ||
      flow.toRegistrationId !== interest.toRegistrationId ||
      ["closed", "declined"].includes(flow.flowStatus) ||
      flow.recipientDecision !== "accepted") return false;
  if (workflow && (!Number.isFinite(workflow.brotherAcceptedAt) ||
      workflow.brotherAcceptedAt! <= 0 || workflow.brotherAcceptedAt! > Date.now())) return false;
  if (interest.matchId) {
    const match = await ctx.db.get(interest.matchId);
    if (!match || match.testResetAt !== undefined || ["closed", "declined"].includes(match.status)) return false;
    try { assertMatchInterest(match, interest); } catch { return false; }
  }
  return true;
}
