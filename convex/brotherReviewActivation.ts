import { SISTER_CONFIRMATION_MODE, sisterActivation } from "./sisterConfirmationActivation";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export const BROTHER_REVIEW_ACTIVATION_KEY = "brotherReviewEmailActivatedAt";
export const BROTHER_REVIEW_MODE = "brother-review-production";
export async function reviewActivation(ctx: MutationCtx | QueryCtx) {
  const row = await ctx.db.query("settings").withIndex("by_key", q => q.eq("key", BROTHER_REVIEW_ACTIVATION_KEY)).unique();
  const at = Number(row?.value);
  return row && Number.isSafeInteger(at) && at > 0 && at <= Date.now() ? at : null;
}
// Production invitation authorization is independent of the shared outbox switch.
// Isolated mode retains the existing simulator-only, exact-allowlist workflow.
export async function deliveryAuthorized(ctx: MutationCtx | QueryCtx, row: Pick<Doc<"femaleWorkflowDeliveries">, "kind" | "createdAt" | "reviewActivationAt" | "sisterActivationAt">) {
  if (process.env.FEMALE_WORKFLOW_EMAIL_MODE === "isolated") return true;
  if (row.kind === "sister_confirmation") {
    if (process.env.FEMALE_WORKFLOW_EMAIL_MODE !== SISTER_CONFIRMATION_MODE || process.env.FEMALE_WORKFLOW_PRODUCTION_APPROVED !== "true") return false;
    const at = await sisterActivation(ctx);
    return at !== null && row.sisterActivationAt === at && row.createdAt > at;
  }
  if (process.env.FEMALE_WORKFLOW_EMAIL_MODE === SISTER_CONFIRMATION_MODE) return false;
  if (row.kind !== "brother_review") return process.env.FEMALE_WORKFLOW_EMAIL_MODE !== BROTHER_REVIEW_MODE;
  if (process.env.FEMALE_WORKFLOW_EMAIL_MODE !== BROTHER_REVIEW_MODE || process.env.FEMALE_WORKFLOW_PRODUCTION_APPROVED !== "true") return false;
  const at = await reviewActivation(ctx);
  return at !== null && row.reviewActivationAt === at && row.createdAt > at;
}
