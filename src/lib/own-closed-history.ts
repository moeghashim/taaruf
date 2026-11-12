// Only the server's authenticated own-action receipt qualifies. Do not infer
// ownership from closed status, initial/final flags, or a missing counterpart.
export function ownClosedHistory<T extends { ownDecision?: string | null }>(rows: T[]): T[] {
  return rows.filter(row => row.ownDecision === "declined" || row.ownDecision === "withdrawn");
}
