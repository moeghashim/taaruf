import type { Doc } from "./_generated/dataModel";

export type MutualEvidence = {
  state: "open" | "completed";
  submissions: { id: string; fromRegistrationId: string; toRegistrationId: string; source: Doc<"interests">["source"]; createdAt: number }[];
};
type Record = Doc<"interests"> & { match: Doc<"matches"> | null; participantsExist: boolean; eventExists: boolean; eventCancelled?: boolean; legacyReleased?: boolean };

/** Directional records, not match approval, establish reciprocity. A complete server scan
 * is grouped once, O(n), with no per-row reverse lookups or loaded-page assumptions. */
export function mutualEvidence(records: Record[]): Map<string, MutualEvidence> {
  const groups = new Map<string, Record[]>();
  for (const i of records) {
    const m = i.match;
    const validMatch = !!m && i.matchId === m._id && new Set([m.maleRegistrationId, m.femaleRegistrationId]).has(i.fromRegistrationId) && new Set([m.maleRegistrationId, m.femaleRegistrationId]).has(i.toRegistrationId);
    if (m && !validMatch) continue;
    const released = i.legacyReleased || m?.contactGate === "contacts_released" || m?.status === "contact_shared" || (!m?.contactGate && m?.adminReleasedAt !== undefined) || i.femaleWorkflow?.state === "contacts_released";
    if (i.testReset || !i.participantsExist || !i.eventExists || i.fromRegistrationId === i.toRegistrationId ||
        i.status === "withdrawn" || (!released && (["declined", "closed"].includes(i.status) || i.adminStatus === "declined" || i.eventCancelled)) ||
        ["revoked", "declined"].includes(i.femaleWorkflow?.state ?? "") || i.match?.testResetAt !== undefined) continue;
    if (i.matchId && (!m || (!released && ["closed", "declined"].includes(m.status)))) continue;
    const key = JSON.stringify([i.eventId, ...[i.fromRegistrationId, i.toRegistrationId].sort(), released ? i.matchId ?? i._id : "open"]);
    const group = groups.get(key) ?? []; group.push(i); groups.set(key, group);
  }
  const result = new Map<string, MutualEvidence>();
  for (const group of groups.values()) {
    if (new Set(group.map(i => i.fromRegistrationId)).size !== 2) continue;
    const completed = group.some(i => i.legacyReleased || i.match?.contactGate === "contacts_released" || i.match?.status === "contact_shared" || (!i.match?.contactGate && i.match?.adminReleasedAt !== undefined) || i.femaleWorkflow?.state === "contacts_released");
    const evidence: MutualEvidence = { state: completed ? "completed" : "open", submissions: [group[0], group.find(i => i.fromRegistrationId !== group[0].fromRegistrationId)!].map(i => ({ id: i._id, fromRegistrationId: i.fromRegistrationId, toRegistrationId: i.toRegistrationId, source: i.source, createdAt: i.createdAt })) };
    for (const i of group) result.set(i._id, evidence);
  }
  return result;
}
