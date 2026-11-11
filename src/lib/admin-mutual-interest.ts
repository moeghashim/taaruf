import { mutualEvidence } from "../../convex/mutualInterest";
import type { Doc } from "../../convex/_generated/dataModel";
import type { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";

type Interest = Doc<"interests"> & {
  fromRegistration: Doc<"registrations"> | null;
  toRegistration: Doc<"registrations"> | null;
  event: Doc<"events"> | null;
  match: Doc<"matches"> | null;
};
/** Called only after bridge admin authorization. Paginate on the server and publish
 * nothing until complete; a failed page cannot turn a reciprocal pair into a negative.
 * One linear scan, no reverse-query per interest, and no operational writes. */
export async function adminMutualInterests(client: Pick<ConvexHttpClient, "consistentQuery">, adminSecret: string, signal?: AbortSignal) {
  const rows: Interest[] = [];
  let cursor: string | null = null;
  const seen = new Set<string>();
  for (;;) {
    signal?.throwIfAborted();
    const result: { page: Interest[]; isDone: boolean; continueCursor: string } = await client.consistentQuery(api.interests.workbenchPage, { adminSecret, paginationOpts: { numItems: 100, cursor } });
    rows.push(...result.page);
    if (result.isDone) break;
    if (!result.continueCursor || seen.has(result.continueCursor)) throw new Error("Incomplete interest scan");
    cursor = result.continueCursor;
    seen.add(result.continueCursor);
  }
  const flows = new Map<string, { fromRegistrationId: string; toRegistrationId: string; contactSharedAt: number }>();
  cursor = null; seen.clear();
  for (;;) {
    signal?.throwIfAborted();
    const result: { page: { interestId: string; fromRegistrationId: string; toRegistrationId: string; contactSharedAt: number }[]; isDone: boolean; continueCursor: string } = await client.consistentQuery(api.interests.disclosureEvidencePage, { adminSecret, paginationOpts: { numItems: 500, cursor } });
    for (const flow of result.page) {
      if (flows.has(flow.interestId)) throw new Error("Ambiguous disclosure evidence");
      flows.set(flow.interestId, flow);
    }
    if (result.isDone) break;
    if (!result.continueCursor || seen.has(result.continueCursor)) throw new Error("Incomplete disclosure scan");
    cursor = result.continueCursor; seen.add(result.continueCursor);
  }
  const legacyReleasedMatches = new Set<string>();
  for (const i of rows) {
    const flow = flows.get(i._id), m = i.match;
    if (flow && m && !m.contactGate && m.testResetAt === undefined && !i.testReset && i.matchId === m._id &&
        flow.fromRegistrationId === i.fromRegistrationId && flow.toRegistrationId === i.toRegistrationId &&
        flow.contactSharedAt >= i.createdAt && [m.maleRegistrationId, m.femaleRegistrationId].includes(i.fromRegistrationId) &&
        [m.maleRegistrationId, m.femaleRegistrationId].includes(i.toRegistrationId)) legacyReleasedMatches.add(m._id);
  }
  const evidence = mutualEvidence(rows.map(i => ({ ...i, participantsExist: !!i.fromRegistration && !!i.toRegistration, eventExists: !!i.event, eventCancelled: i.event?.status === "cancelled", legacyReleased: !!i.matchId && legacyReleasedMatches.has(i.matchId) })));
  return rows.map(i => ({ ...i, mutual: evidence.get(i._id) ?? null }));
}
