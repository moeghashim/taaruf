export type InterestNoticeInput = {
  interestId: string; femaleWorkflow?: boolean; direction: string; status: string; flowStatus: string;
  paused?: boolean; canRespond: boolean; canFinalApprove: boolean; ownFinalApproval: string; ownInitialDecision?: string | null;
  contactSharedAt: number | null; counterparty: { email?: string | null; phone?: string | null } | null;
};
export type ReviewNoticeInput = { interestId: string; state: string; role: string; ownDecision?: string; ownAction?: string | null; ownActionStage?: "initial" | "final" | null; paused?: boolean; reviewExpired?: boolean; canView?: boolean };
export type ConnectionNotice = { id: string; heading: string; copy: string; href?: string; action?: string; priority: number };
const closedStates = ["closed", "declined", "withdrawn", "revoked", "expired", "rejected"];
export const approvedCopy = "Contact details will be shared after the admin reviews and approves the match.";
export const matchCreatedHeading = "A match has been created!";
export const matchCreatedCopy = "Review the profile to see the shared contact details.";
// Both endpoints project the SAME interests._id. Never correlate by participants:
// the same pair may have independent invitations across multiple events.
export function receivedInterestUpdates(interests: InterestNoticeInput[], reviews: ReviewNoticeInput[], readyIds: string[] = []): ConnectionNotice[] {
  const result = new Map<string, ConnectionNotice>();
  for (const item of interests) {
    if (result.has(item.interestId) || item.femaleWorkflow) continue;
    const closed = closedStates.includes(item.status) || closedStates.includes(item.flowStatus);
    if (closed || [item.status, item.flowStatus, item.ownInitialDecision].some(value => value === "kept_open" || value === "keep_open")) continue;
    const pending = !item.paused && (item.canRespond || item.canFinalApprove);
    const ready = !closed && !item.paused && !!item.contactSharedAt && !!(item.counterparty?.email?.trim() || item.counterparty?.phone?.trim());
    // Idle updates cannot distinguish unanswered interests from a private
    // counterpart keep-open decision. History retains their neutral status.
    if (!pending && !ready) continue;
    result.set(item.interestId, {
      id: item.interestId, priority: pending ? 0 : 1,
      heading: ready ? matchCreatedHeading : item.canRespond && !item.canFinalApprove ? "You Have Received An Interest" : "Your review is needed",
      copy: ready ? matchCreatedCopy : "This connection is awaiting your review.",
      ...(!closed && item.counterparty ? { href: "/me?connection=" + encodeURIComponent(item.interestId) + (item.direction === "private" ? "#private-documented-interests" : item.direction === "outbound" ? "#outbound-interests" : "#inbound-interests"), action: ready ? "Review profile" : "View interest" } : {}),
    });
  }
  // Workflow projection owns workflow actions even when an older general GET
  // omits femaleWorkflow. An own pending review outranks a generic idle update.
  for (const item of reviews) {
    const closed = closedStates.includes(item.state);
    // Workflow authority must also remove a stale generic notice for this ID.
    result.delete(item.interestId);
    if (closed || [item.state, item.ownDecision].some(value => value === "keep_open" || value === "kept_open" || value === "declined" || value === "rejected")) continue;
    const pending = !closed && !item.paused && !item.reviewExpired && item.ownAction === "review";
    const ready = !closed && !item.paused && !item.reviewExpired && item.canView === true && item.state === "contacts_released" && readyIds.includes(item.interestId);
    // Idle updates cannot distinguish unanswered interests from a private
    // counterpart keep-open decision. History retains their neutral status.
    if (!pending && !ready) continue;
    result.set(item.interestId, {
      id: item.interestId, priority: pending ? 0 : 1,
      heading: ready ? matchCreatedHeading : item.role === "brother" && item.ownActionStage !== "final" ? "You Have Received An Interest" : "Your review is needed",
      copy: ready ? matchCreatedCopy : "This connection is awaiting your review.",
      ...(!closed && !item.reviewExpired && (pending || item.canView) ? { href: "/me?femaleReview=" + encodeURIComponent(item.interestId) + (item.role === "sister" ? "#outbound-interests" : "#inbound-interests"), action: ready ? "Review profile" : pending ? item.role === "sister" || item.ownActionStage === "final" ? "Review profile and respond" : "Review profile" : "View review" } : {}),
    });
  }
  return [...result.values()].sort((a, b) => a.priority - b.priority);
}
