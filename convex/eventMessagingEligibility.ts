/** Profile eligibility is independent of event booking/confirmation status.
 * Legacy backgroundCheck is free text; only explicit failure values are interpreted.
 * Never expose a rejection reason in applicant-facing errors.
 */
export function canReceiveEventMessages(profile: { status?: string; backgroundCheck?: string } | null | undefined): boolean {
  if (!profile || profile.status === "rejected") return false;
  const backgroundCheck = profile.backgroundCheck?.trim().toLowerCase().replace(/[_-]+/g, " ");
  return !["failed", "fail", "rejected", "failed background check", "background check failed"].includes(backgroundCheck ?? "");
}

export function requireEventMessagingEligibility(profile: { status?: string; backgroundCheck?: string } | null | undefined): void {
  if (!canReceiveEventMessages(profile)) throw new Error("Event messaging and confirmation are unavailable for this profile");
}
