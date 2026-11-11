/** Manual recommendations have no presentation lifecycle yet (issue #97).
 * Never reinterpret historical contact release as a private draft.
 */
export function isManualMatchDraft(match: { interestId?: unknown; interestType?: string; initiatedBy?: string; status?: string; contactGate?: string; adminReleasedAt?: number; contactSharedNotificationSentAt?: number } | null | undefined): boolean {
  return Boolean(match && !match.interestId && (match.interestType === "admin_suggested" || match.initiatedBy === "admin_recommendation") && match.status !== "contact_shared" && match.contactGate !== "contacts_released" && match.adminReleasedAt === undefined && match.contactSharedNotificationSentAt === undefined);
}
