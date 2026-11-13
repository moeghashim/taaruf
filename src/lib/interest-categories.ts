import type { ReviewNoticeInput } from "./received-interest-updates";

type Interest = { interestId: string; femaleWorkflow?: boolean; receiptOnly?: boolean; direction: string };
// canView is already applicant-authorized and becomes true only after the
// recipient-specific createReview share. Neither approval nor acceptance is
// inferred here. Keep the original row/actions/privacy projection unchanged.
export function interestCategories<T extends Interest>(outbound: T[], privateDocumented: T[], reviews: ReviewNoticeInput[]) {
  const shared = new Set(reviews.filter(row => row.role === "sister" && row.canView === true && !["closed", "declined", "withdrawn", "revoked"].includes(row.state)).map(row => row.interestId));
  const moved = privateDocumented.filter(row => (row.receiptOnly || row.femaleWorkflow && shared.has(row.interestId)));
  const movedIds = new Set(moved.map(row => row.interestId));
  const seen = new Set<string>();
  return {
    outbound: [...outbound, ...moved].filter(row => { if (seen.has(row.interestId)) return false; seen.add(row.interestId); return true; }),
    privateDocumented: privateDocumented.filter(row => !movedIds.has(row.interestId)),
  };
}

// Mutual membership comes only from the authorized review projection.
export function visibleWorkflowReviews(reviews: ReviewNoticeInput[], direction: "inbound" | "outbound") {
  return reviews.filter(row => row.canView === true && !row.reviewExpired && !["closed", "declined", "withdrawn", "revoked", "expired"].includes(row.state) && (direction === "inbound" ? row.role === "brother" || row.mutualInterest === true : row.role === "sister" && !row.mutualInterest));
}

export function selectedWorkflowReview(reviews: ReviewNoticeInput[], requestedId: string | null, hasExplicitSelection: boolean) {
  // An explicit link must reach the authoritative detail GET even when absent
  // from a partial, stale, expired or failed list. Selection is not authorization.
  if (hasExplicitSelection) return requestedId;
  return reviews.find(row => row.role === "sister" && row.ownAction === "review" && row.ownActionStage === "final" && !row.paused)?.interestId ?? reviews.find(row => row.mutualInterest)?.interestId ?? null;
}
