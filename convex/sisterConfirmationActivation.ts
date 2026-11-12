import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
export const SISTER_CONFIRMATION_ACTIVATION_KEY = "sisterConfirmationEmailActivatedAt";
export const SISTER_CONFIRMATION_MODE = "sister-confirmation-production";
export async function sisterActivation(ctx: MutationCtx | QueryCtx) {
  const row = await ctx.db.query("settings").withIndex("by_key", q => q.eq("key", SISTER_CONFIRMATION_ACTIVATION_KEY)).unique();
  const at = Number(row?.value);
  return row && Number.isSafeInteger(at) && at > 0 && at <= Date.now() ? at : null;
}
export function currentSisterConfirmation(interest: Doc<"interests">, row: Doc<"femaleWorkflowDeliveries">) {
  const w = interest.femaleWorkflow;
  return !interest.matchId && row.recipientId === interest.fromRegistrationId &&
    w?.state === "awaiting_sister_confirmation" && w.sisterConfirmedAt === undefined && !!w.reviewTokenHash &&
    (row.sisterActivationAt === undefined || w.brotherAcceptedAt! > row.sisterActivationAt) &&
    !!w.reviewExpiresAt && w.reviewExpiresAt > Date.now() && !!w.brotherAcceptedAt &&
    (row.sisterAcceptedAt === undefined ? process.env.FEMALE_WORKFLOW_EMAIL_MODE === "isolated" : row.sisterAcceptedAt === w.brotherAcceptedAt);
}
