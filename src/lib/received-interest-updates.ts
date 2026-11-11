export type InterestNoticeInput = {
  interestId: string; femaleWorkflow?: boolean; direction: string; status: string; flowStatus: string;
  paused?: boolean; canRespond: boolean; canFinalApprove: boolean; ownFinalApproval: string;
  contactSharedAt: number | null; counterparty: { email?: string | null; phone?: string | null } | null;
};
export type ReviewNoticeInput = { interestId: string; state: string; role: string; ownDecision?: string; ownAction?: string | null; paused?: boolean; reviewExpired?: boolean; canView?: boolean };
export type ConnectionNotice = { id: string; heading: string; copy: string; href?: string; action?: string; priority: number };
const closedStates = ["closed", "declined", "withdrawn", "revoked", "expired"];
export const approvedCopy = "Contact details will be shared after the admin reviews and approves the match.";
const closedCopy = "This connection is no longer available. No further response is needed.";
// Both endpoints project the SAME interests._id. Never correlate by participants:
// the same pair may have independent invitations across multiple events.
export function receivedInterestUpdates(interests: InterestNoticeInput[], reviews: ReviewNoticeInput[], readyIds: string[] = []): ConnectionNotice[] {
  const result = new Map<string, ConnectionNotice>();
  for (const item of interests) {
    if (result.has(item.interestId) || item.femaleWorkflow) continue;
    const closed = closedStates.includes(item.status) || closedStates.includes(item.flowStatus);
    const pending = !closed && !item.paused && (item.canRespond || item.canFinalApprove);
    const ready = !closed && !item.paused && !!item.contactSharedAt && !!(item.counterparty?.email?.trim() || item.counterparty?.phone?.trim());
    result.set(item.interestId, {
      id: item.interestId, priority: pending ? 0 : ready ? 1 : 2,
      heading: closed ? "Connection closed" : item.paused ? "Connection paused" : ready ? "Contacts are ready" : pending ? item.canRespond && !item.canFinalApprove ? "You Have Received An Interest" : "Your review is needed" : item.direction === "outbound" ? "You Have Sent an Interest" : "Interest update",
      copy: closed ? closedCopy : item.paused ? "This connection is paused." : ready ? "Open your connection to see the contact details available to you." : pending ? "This connection is awaiting your review." : item.ownFinalApproval === "approved" ? approvedCopy : "No response is currently needed from you. You can review your connection.",
      ...(!closed && item.counterparty ? { href: "/me?connection=" + encodeURIComponent(item.interestId) + (item.direction === "private" ? "#private-documented-interests" : item.direction === "outbound" ? "#outbound-interests" : "#inbound-interests"), action: ready ? "View contact details" : "View interest" } : {}),
    });
  }
  // Workflow projection owns workflow actions even when an older general GET
  // omits femaleWorkflow. An own pending review outranks a generic idle update.
  for (const item of reviews) {
    const closed = closedStates.includes(item.state);
    const pending = !closed && !item.paused && !item.reviewExpired && item.ownAction === "review";
    const ready = !closed && !item.paused && !item.reviewExpired && readyIds.includes(item.interestId);
    result.set(item.interestId, {
      id: item.interestId, priority: pending ? 0 : ready ? 1 : 2,
      heading: closed ? "Connection closed" : item.reviewExpired ? "Review invitation expired" : item.paused ? "Connection paused" : ready ? "Contacts are ready" : pending ? item.role === "brother" ? "You Have Received An Interest" : "Your review is needed" : "Interest update",
      copy: closed ? closedCopy : item.reviewExpired ? "Please contact the matchmaking team to request a new review invitation." : item.paused ? "This connection is paused." : ready ? "The team has approved sharing contact details. Open your review to see the contact details available to you." : pending ? "This connection is awaiting your review." : item.ownDecision === "approved" ? approvedCopy : "This connection is being reviewed. Contact details remain private until the team approves sharing them.",
      ...(!closed && !item.reviewExpired && (pending || item.canView) ? { href: "/dashboard?femaleReview=" + encodeURIComponent(item.interestId) + (ready ? "#contact-details" : ""), action: ready ? "View contact details" : pending ? item.role === "sister" ? "Review profile and respond" : "Review profile" : "View review" } : {}),
    });
  }
  return [...result.values()].sort((a, b) => a.priority - b.priority);
}
