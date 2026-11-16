import type { Doc } from "../../convex/_generated/dataModel";
import type { WorkbenchFinalApprovals } from "../../convex/workbenchApproval";
export type Interest = Pick<Doc<"interests">, "status" | "testReset" | "femaleWorkflow"> & { match?: Doc<"matches"> | null; finalApprovals?: WorkbenchFinalApprovals | null };
export function canReleaseContacts(match?: Doc<"matches"> | null) {
  return Boolean(match?.interestId && !match.testResetAt && match.contactGate === "pending_admin_approval" && ["new", "reviewing"].includes(match.status));
}
export function interestLifecycle(interest: Interest): string {
  const label = approvalLifecycle(interest);
  return interest.status === "queued" && !interest.testReset ? `Queued — ${label}` : label;
}
function approvalLifecycle(interest: Interest): string {
  if (interest.testReset) return "Test reset — audit retained";
  if (["closed", "declined", "withdrawn"].includes(interest.status)) return interest.status[0].toUpperCase() + interest.status.slice(1);
  if (interest.match?.status === "paused") return "Paused";
  if (interest.match?.contactGate === "contacts_released" || interest.match?.status === "contact_shared" || interest.femaleWorkflow?.state === "contacts_released") return "Contacts released";
  if (canReleaseContacts(interest.match)) return "Both approved — awaiting contact release";
  if (interest.femaleWorkflow?.state === "awaiting_sister_confirmation") {
    const finals = interest.finalApprovals;
    if (!finals) return "Final approval status unavailable";
    if (finals.requester === "declined" || finals.recipient === "declined") return "Declined";
    if (finals.requester === "approved" && finals.recipient === "approved") return "Both final approvals saved";
    if (finals.requester === "approved") return "Sister approved — awaiting brother’s final approval";
    if (finals.recipient === "approved") return "Brother approved — awaiting sister’s final approval";
    return "Awaiting both final approvals";
  }
  const labels: Record<string, string> = { private_documented: "Requester profile not yet shared", awaiting_brother_review: "Awaiting recipient review", pending_admin_approval: "Both approved — awaiting contact release", revoked: "Review revoked", declined: "Declined" };
  if (interest.femaleWorkflow) return labels[interest.femaleWorkflow.state] ?? interest.femaleWorkflow.state.replaceAll("_", " ");
  return "Awaiting applicant approvals";
}
/** A converted row is history only when its actual linked match is present. */
export function isResolvedInterest(interest: Interest & { matchId?: Doc<"matches">["_id"] }) {
  return interest.status === "converted_to_match" && !!interest.matchId && interest.match?._id === interest.matchId;
}
export function isArchivedInterest(interest: Interest) {
  return Boolean(interest.testReset || ["closed", "declined", "withdrawn"].includes(interest.status) || approvalLifecycle(interest) === "Contacts released" || ["revoked", "declined"].includes(interest.femaleWorkflow?.state ?? ""));
}

/** A pointer alone is not evidence of released contacts or current availability. */
export function activeConnectionLabel(person: Pick<Doc<"registrations">, "_id" | "activeMatchId">, matches: readonly Doc<"matches">[]): string {
  if (!person.activeMatchId) return "No released active connection";
  const match = matches.find(m => m._id === person.activeMatchId);
  if (!match || ![match.maleRegistrationId, match.femaleRegistrationId].includes(person._id)) return "Active connection status unavailable. Global safety checks still apply.";
  if (match.testResetAt !== undefined || ["closed", "declined", "paused"].includes(match.status)) return "No released active connection";
  if (match.contactGate === "contacts_released" || match.status === "contact_shared") return "Contacts already released in an active connection. A second release is blocked.";
  return "Active connection exists; contacts not released. Global safety checks still apply.";
}
