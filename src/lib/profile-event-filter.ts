/** Membership is an eventRegistrations relationship, not attendance or interest eligibility.
 * Preserve every persisted status; conflicting legacy duplicates are shown, not reinterpreted. */
export function eventMembershipStatuses(rows: readonly { registrationId: string; registrationStatus: string }[]) {
  const memberships = new Map<string, string[]>();
  for (const row of rows) {
    const statuses = memberships.get(row.registrationId) ?? [];
    if (!statuses.includes(row.registrationStatus)) statuses.push(row.registrationStatus);
    memberships.set(row.registrationId, statuses);
  }
  return memberships;
}
export function filterEventMembers<T extends { _id: string }>(profiles: readonly T[], membership: ReadonlyMap<string, readonly string[]> | null) {
  const seen = new Set<string>();
  return profiles.filter(profile => {
    if (seen.has(profile._id) || (membership && !membership.has(profile._id))) return false;
    seen.add(profile._id);
    return true;
  });
}
export function profilePage<T>(profiles: readonly T[], requestedPage: number, size = 25) {
  const pages = Math.max(1, Math.ceil(profiles.length / size));
  const page = Math.max(1, Math.min(requestedPage, pages));
  return { page, pages, rows: profiles.slice((page - 1) * size, page * size) };
}
