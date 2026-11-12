/** Archive is independent of the historical approval decision. */
export type ProfileListStatus = "all" | "approved" | "pending" | "rejected" | "archived";
export function isArchivedProfile(profile: { archivedAt?: number }) {
  return profile.archivedAt !== undefined;
}
export function matchesProfileListStatus(profile: { status: string; archivedAt?: number }, status: ProfileListStatus) {
  if (status === "archived") return isArchivedProfile(profile);
  return status === "all" || profile.status === status;
}
