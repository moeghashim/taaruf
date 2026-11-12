import type { Doc } from "../../convex/_generated/dataModel";
type Interest = Pick<Doc<"interests">, "status" | "testReset" | "femaleWorkflow"> & { match?: Doc<"matches"> | null };
export function canReleaseContacts(match?: Doc<"matches"> | null) {
  return Boolean(match?.interestId && !match.testResetAt && match.contactGate === "pending_admin_approval" && ["new", "reviewing"].includes(match.status));
}
export function interestLifecycle(interest: Interest): string {
  if (interest.testReset) return "Test reset — audit retained";
  if (["closed", "declined", "withdrawn"].includes(interest.status)) return interest.status[0].toUpperCase() + interest.status.slice(1);
  if (interest.match?.status === "paused") return "Paused";
  if (interest.match?.contactGate === "contacts_released" || interest.match?.status === "contact_shared" || interest.femaleWorkflow?.state === "contacts_released") return "Contacts released";
  if (canReleaseContacts(interest.match)) return "Both approved — awaiting contact release";
  const labels: Record<string, string> = { private_documented: "Requester profile not yet shared", awaiting_brother_review: "Awaiting recipient review", awaiting_sister_confirmation: "Recipient approved — awaiting requester confirmation", pending_admin_approval: "Both approved — awaiting contact release", revoked: "Review revoked", declined: "Declined" };
  if (interest.femaleWorkflow) return labels[interest.femaleWorkflow.state] ?? interest.femaleWorkflow.state.replaceAll("_", " ");
  return "Awaiting applicant approvals";
}
export function isArchivedInterest(interest: Interest) {
  return Boolean(interest.testReset || ["closed", "declined", "withdrawn"].includes(interest.status) || interestLifecycle(interest) === "Contacts released" || ["revoked", "declined"].includes(interest.femaleWorkflow?.state ?? ""));
}
