import { FINAL_REQUEST_MODE, finalRequestEnabled, finalActivation } from "./finalRequest";
import { SISTER_CONFIRMATION_MODE, sisterActivation } from "./sisterConfirmationActivation";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export const BROTHER_REVIEW_ACTIVATION_KEY = "brotherReviewEmailActivatedAt";
export const BROTHER_REVIEW_MODE = "brother-review-production";
export const COMBINED_REVIEW_MODE = "brother-sister-review-production";
// Explicit pair only; not the generic production outbox.
export function reviewKindEnabled(kind: "brother_review" | "sister_confirmation") {
  const mode = process.env.FEMALE_WORKFLOW_EMAIL_MODE;
  return (kind === "brother_review" && mode === FINAL_REQUEST_MODE) || mode === COMBINED_REVIEW_MODE || mode === (kind === "brother_review" ? BROTHER_REVIEW_MODE : SISTER_CONFIRMATION_MODE);
}
export async function reviewActivation(ctx: MutationCtx | QueryCtx) {
  const row = await ctx.db.query("settings").withIndex("by_key", q => q.eq("key", BROTHER_REVIEW_ACTIVATION_KEY)).unique();
  const at = Number(row?.value);
  return row && Number.isSafeInteger(at) && at > 0 && at <= Date.now() ? at : null;
}
// Production invitation authorization is independent of the shared outbox switch.
// Isolated mode retains the existing simulator-only, exact-allowlist workflow.
export async function deliveryAuthorized(ctx: MutationCtx | QueryCtx, row: Pick<Doc<"femaleWorkflowDeliveries">, "kind" | "createdAt" | "reviewActivationAt" | "sisterActivationAt" | "finalActivationAt">) {
  if (row.kind === "final_request") {
    const at = await finalActivation(ctx);
    return finalRequestEnabled() && process.env.FEMALE_WORKFLOW_PRODUCTION_APPROVED === "true" && at !== null && row.finalActivationAt === at && row.createdAt > at;
  }
  if (finalRequestEnabled() && row.kind !== "brother_review") return false;
  if (process.env.FEMALE_WORKFLOW_EMAIL_MODE === "isolated") return true;
  if (row.kind === "sister_confirmation") {
    if (!reviewKindEnabled("sister_confirmation") || process.env.FEMALE_WORKFLOW_PRODUCTION_APPROVED !== "true") return false;
    const at = await sisterActivation(ctx);
    return at !== null && row.sisterActivationAt === at && row.createdAt > at;
  }
  if (process.env.FEMALE_WORKFLOW_EMAIL_MODE === SISTER_CONFIRMATION_MODE) return false;
  if (row.kind !== "brother_review") return ![BROTHER_REVIEW_MODE, COMBINED_REVIEW_MODE].includes(process.env.FEMALE_WORKFLOW_EMAIL_MODE ?? "");
  if (!reviewKindEnabled("brother_review") || process.env.FEMALE_WORKFLOW_PRODUCTION_APPROVED !== "true") return false;
  const at = await reviewActivation(ctx);
  return at !== null && row.reviewActivationAt === at && row.createdAt > at;
}
