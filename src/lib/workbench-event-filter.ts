/** Only a valid primary interest establishes match provenance; never infer from attendance. */
export function matchEventId(match: { _id: string; interestId?: string; maleRegistrationId: string; femaleRegistrationId: string; interest: { _id: string; eventId: string; matchId?: string; fromRegistrationId: string; toRegistrationId: string; testReset?: unknown } | null }) {
 const i = match.interest;
 if (!i || i.testReset || match.interestId !== i._id || i.matchId !== match._id) return null;
 const pair = new Set([match.maleRegistrationId, match.femaleRegistrationId]);
 return pair.size === 2 && i.fromRegistrationId !== i.toRegistrationId && pair.has(i.fromRegistrationId) && pair.has(i.toRegistrationId) ? i.eventId : null;
}
export function inEventScope(eventId: string | null, scope: string) {
 return scope === "all" || (scope === "unscoped" ? eventId === null : eventId === scope);
}

export function scopedWorkbenchRecords<I extends { _id: string; eventId: string; matchId?: string; fromRegistrationId: string; toRegistrationId: string; testReset?: unknown; match: unknown }, M extends Parameters<typeof matchEventId>[0]>(allInterests: I[], allMatches: M[], scope: string) {
 const matches = allMatches.filter(m => inEventScope(matchEventId(m), scope)).map(m => matchEventId(m) ? m : { ...m, interest: null });
 const byId = new Map(matches.map(m => [m._id, m]));
 const interests = allInterests.filter(i => inEventScope(i.eventId, scope)).map(i => {
  const linked = i.matchId ? byId.get(i.matchId) : undefined;
  const pair = linked && new Set([linked.maleRegistrationId, linked.femaleRegistrationId]);
  const valid = linked && matchEventId(linked) === i.eventId && !i.testReset && i.fromRegistrationId !== i.toRegistrationId && pair?.has(i.fromRegistrationId) && pair.has(i.toRegistrationId);
  return { ...i, match: valid ? linked : null };
 });
 return { interests, matches };
}
