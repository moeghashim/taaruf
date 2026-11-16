import type { Doc } from "../../convex/_generated/dataModel";
type Interest = Pick<Doc<"interests">, "status" | "testReset" | "femaleWorkflow"> & { match?: Doc<"matches"> | null; workbenchReview?: { label: string } | null };
export function canReleaseContacts(match?: Doc<"matches"> | null) {
  return Boolean(match?.interestId && !match.testResetAt && match.contactGate === "pending_admin_approval" && ["new", "reviewing"].includes(match.status));
}
export function interestLifecycle(interest: Interest): string {
  // Never guess approval actors from legacy workflow stage names.
  if (interest.workbenchReview) return interest.workbenchReview.label;
  if (interest.testReset) return "Test reset — audit retained";
  if (["closed", "declined", "withdrawn"].includes(interest.status)) return interest.status[0].toUpperCase() + interest.status.slice(1);
  if (interest.match?.status === "paused") return "Paused";
  if (interest.match?.contactGate === "contacts_released" || interest.match?.status === "contact_shared" || interest.femaleWorkflow?.state === "contacts_released") return "Contacts released";
  if (interest.femaleWorkflow?.state === "revoked") return "Review revoked";
  if (interest.femaleWorkflow?.state === "declined") return "Declined";
  return "Admin check — Canonical review/approval details unavailable; compatible backend required";
}
/** A converted row is history only when its actual linked match is present. */
export function isResolvedInterest(interest: Interest & { matchId?: Doc<"matches">["_id"] }) {
  return interest.status === "converted_to_match" && !!interest.matchId && interest.match?._id === interest.matchId;
}
export function isArchivedInterest(interest: Interest) {
  return Boolean(interest.testReset || ["closed", "declined", "withdrawn"].includes(interest.status) || (interest.match?.status !== "paused" && (interest.match?.contactGate === "contacts_released" || interest.match?.status === "contact_shared" || interest.femaleWorkflow?.state === "contacts_released")) || ["revoked", "declined"].includes(interest.femaleWorkflow?.state ?? ""));
}
