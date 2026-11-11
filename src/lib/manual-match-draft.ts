/** Manual recommendations stay private until explicit presentation.
 * Never reinterpret historical contact release as a private draft.
 */
export function isManualMatchDraft(match: { matchmakerPresentedAt?: number; interestId?: unknown; interestType?: string; initiatedBy?: string; status?: string; contactGate?: string; adminReleasedAt?: number; contactSharedNotificationSentAt?: number } | null | undefined): boolean {
  return Boolean(match && match.matchmakerPresentedAt === undefined && !match.interestId && (match.interestType === "admin_suggested" || match.initiatedBy === "admin_recommendation") && match.status !== "contact_shared" && match.contactGate !== "contacts_released" && match.adminReleasedAt === undefined && match.contactSharedNotificationSentAt === undefined);
}
