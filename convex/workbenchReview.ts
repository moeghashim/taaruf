import { isManualMatchDraft } from "../src/lib/manual-match-draft";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { assertMatchInterest, assertParticipantsAvailable, linkedFlows, pairFlows } from "./contactGate";
import { assertCanonicalAction } from "./reciprocalConnection";
import { isSecurityRetired } from "./registrationSecurity";

/** Query-local memoization; never reuse across requests or mutations.
 * Only exact equality-index reads are cached, with terminal operation and limit.
 */
export function createWorkbenchReviewContext(ctx: QueryCtx): QueryCtx {
  const reads = new Map<string, unknown>();
  const memo = (key: string, read: () => unknown) => {
    if (!reads.has(key)) reads.set(key, read());
    return reads.get(key);
  };
  const db = new Proxy(ctx.db, {
    get(target, property, receiver) {
      if (property === "get") return (...args: unknown[]) => memo(JSON.stringify(["get", args]), () => Reflect.apply(target.get, target, args));
      if (property !== "query") return Reflect.get(target, property, receiver);
      return (table: string) => {
        const query = Reflect.apply(target.query, target, [table]);
        return new Proxy(query, {
          get(queryTarget, method, queryReceiver) {
            if (method !== "withIndex") return Reflect.get(queryTarget, method, queryReceiver);
            return (index: string, range?: (builder: unknown) => unknown) => {
              const clauses: unknown[] = [];
              let cacheable = true;
              const indexed = queryTarget.withIndex(index, range ? (builder: object) => {
                const wrap = (value: object): object => new Proxy(value, {
                  get(rangeTarget, operation, rangeReceiver) {
                    if (!["eq", "gt", "gte", "lt", "lte"].includes(String(operation))) return Reflect.get(rangeTarget, operation, rangeReceiver);
                    return (...args: unknown[]) => {
                      if (operation !== "eq") cacheable = false;
                      clauses.push([operation, args]);
                      return wrap(Reflect.apply(Reflect.get(rangeTarget, operation), rangeTarget, args));
                    };
                  },
                });
                return range(wrap(builder));
              } : undefined);
              return new Proxy(indexed, {
                get(indexTarget, operation, indexReceiver) {
                  if (!cacheable || !["take", "unique", "collect", "first"].includes(String(operation))) return Reflect.get(indexTarget, operation, indexReceiver);
                  return (...args: unknown[]) => memo(JSON.stringify([table, index, clauses, operation, args]), () => Reflect.apply(Reflect.get(indexTarget, operation), indexTarget, args));
                },
              });
            };
          },
        });
      };
    },
  });
  return { ...ctx, db };
}

const terminal = (row: Doc<"interests">) => row.testReset || row.adminRemovedAt !== undefined || ["closed", "declined", "withdrawn"].includes(row.status) || row.adminStatus === "declined" || ["declined", "revoked"].includes(row.femaleWorkflow?.state ?? "");
const check = (issue: string) => ({ label: "Admin check — " + issue });
const personLabel = (person: Doc<"registrations">) => (person.gender === "male" ? "brother" : "sister") + " #" + person.publicApplicantNumber;

/** Admin-only read projection. Never repairs rows, issues capabilities, or grants consent. */
export async function workbenchReview(ctx: QueryCtx, source: Doc<"interests">): Promise<{ label: string }> {
  if (terminal(source)) return { label: "Closed — " + (source.testReset ? "Test reset" : source.status === "withdrawn" ? "Interest withdrawn" : source.status === "declined" || source.adminStatus === "declined" || source.femaleWorkflow?.state === "declined" ? "Interest declined" : "Interest closed") };
  let interest = source;
  if (source.canonicalInterestId) {
    const canonical = await ctx.db.get(source.canonicalInterestId);
    if (!canonical || canonical.canonicalInterestId || canonical.eventId !== source.eventId || canonical.fromRegistrationId !== source.toRegistrationId || canonical.toRegistrationId !== source.fromRegistrationId) return check("Canonical interest missing or mismatched");
    if (terminal(canonical)) return { label: "Closed — Canonical interest closed" };
    interest = canonical;
  }
  const from = await ctx.db.get(interest.fromRegistrationId);
  const to = await ctx.db.get(interest.toRegistrationId);
  if (!from || !to) return check("Applicant profile missing");
  if (from._id === to._id || from.gender === to.gender) return check("Applicant pair identity mismatch");
  if ([from, to].some(p => p.archivedAt !== undefined || isSecurityRetired(p))) return check("Applicant archived or unavailable");
  if ([from, to].some(p => p.lastRestoredArchivedAt !== undefined && interest.createdAt <= p.lastRestoredArchivedAt)) return check("Historical workflow predates applicant restoration");
  if ([from, to].some(p => p.publicApplicantNumber === undefined)) return check("Public applicant number missing");
  const brother = from.gender === "male" ? from : to;
  const sister = from.gender === "female" ? from : to;
  const match = interest.matchId ? await ctx.db.get(interest.matchId) : null;
  if (interest.matchId && !match) return check("Linked match missing");
  if (match) {
    try { assertMatchInterest(match, interest); } catch { return check("Linked match pair mismatch"); }
    if (match.testResetAt !== undefined || ["closed", "declined"].includes(match.status)) return { label: "Closed — Linked match is no longer active" };
    if (match.status === "paused") return { label: "Paused — Linked match paused" };
    if (match.contactGate === "contacts_released" || match.status === "contact_shared" || match.adminReleasedAt !== undefined) return { label: "Contacts released — " + personLabel(brother) + " and " + personLabel(sister) };
  }
  try {
    await assertCanonicalAction(ctx, interest);
    const rows = await pairFlows(ctx, interest);
    const own = rows.find(row => row.interest._id === interest._id);
    if (!own) return check("Interest flow missing");
    if (rows.some(({flow}) => flow.requesterFinalApproval === "declined" || flow.recipientFinalApproval === "declined" || flow.recipientDecision === "declined")) return check("Conflicting or declined decision in active workflow");
    // Only source-action provenance counts. Legacy approval flags and initial acceptance
    // (including sisterConfirmedAt/brotherAcceptedAt) never establish final consent.
    const approved = new Set<string>();
    for (const {flow, interest: row} of rows) {
      const needsEvents = (flow.requesterFinalApproval === "approved" && flow.requesterExplicitFinalAt === undefined) || (flow.recipientFinalApproval === "approved" && flow.recipientExplicitFinalAt === undefined);
      const events = needsEvents ? await ctx.db.query("interestFlowEvents").withIndex("by_interestId", q => q.eq("interestId", row._id)).take(1001) : [];
      if (events.length > 1000) return check("Consent history requires manual review");
      for (const [id, decision, explicit] of [[flow.fromRegistrationId, flow.requesterFinalApproval, flow.requesterExplicitFinalAt], [flow.toRegistrationId, flow.recipientFinalApproval, flow.recipientExplicitFinalAt]] as const) {
        if (decision === "approved" && (explicit !== undefined || events.some(e => e.interestFlowId === flow._id && e.actor === "applicant" && e.actorRegistrationId === id && e.eventType === "explicit_final_approval_given"))) approved.add(id);
      }
    }
    const b = approved.has(brother._id), s = approved.has(sister._id);
    let pending: string;
    if ((b || s) && own.flow.recipientDecision !== "accepted") return check("Final approval exists but initial bio decision is not accepted");
    if (b && s) pending = "Both final approvals saved";
    else if (s) pending = "Waiting on brother #" + brother.publicApplicantNumber + " — Final approval (sister approved)";
    else if (b) pending = "Waiting on sister #" + sister.publicApplicantNumber + " — Final approval (brother approved)";
    else if (own.flow.recipientDecision === "accepted") pending = "Waiting on both — Final approval: " + personLabel(brother) + " and " + personLabel(sister);
    else if (own.flow.flowStatus === "private_documented" && !interest.femaleWorkflow?.reviewTokenHash) pending = "Admin action — Share " + personLabel(from) + "’s profile for review";
    else if (["awaiting_inbound_response", "kept_open", "private_documented"].includes(own.flow.flowStatus) || interest.femaleWorkflow?.state === "awaiting_brother_review") pending = "Waiting on " + personLabel(to) + " — Initial bio decision";
    else return check("Initial decision missing or ambiguous");

    // Identify actual blockers; never suggest that queue/defer is itself consent.
    const blockers: string[] = [];
    for (const person of [brother, sister]) {
      if (person.status !== "approved") blockers.push(personLabel(person) + " is not approved");
      const matches = await ctx.db.query("matches").withIndex(person.gender === "male" ? "by_maleRegistrationId" : "by_femaleRegistrationId", q => person.gender === "male" ? q.eq("maleRegistrationId", person._id) : q.eq("femaleRegistrationId", person._id)).take(1001);
      if (matches.length > 1000) return check("Match history requires manual review");
      const other = matches.find(m => m._id !== match?._id && m.testResetAt === undefined && !["closed", "declined", "paused"].includes(m.status) && !isManualMatchDraft(m));
      if (other) blockers.push(personLabel(person) + " has another active match");
      if (!other && person.activeMatchId && person.activeMatchId !== match?._id) blockers.push("Admin check — " + personLabel(person) + " has a stale or unverified active-match pointer blocking availability");
      // Other active interests are not a contact-gate availability restriction.
    }
    const unexplained = rows.some(({flow}) => (flow.requesterFinalApproval === "approved" && !approved.has(flow.fromRegistrationId)) || (flow.recipientFinalApproval === "approved" && !approved.has(flow.toRegistrationId)));
    if (unexplained) pending = "Admin check — Legacy final approval lacks explicit provenance; " + pending;
    const queued = ["queued", "deferred"].includes(interest.status);
    if (queued || blockers.length) return { label: (queued ? interest.status[0].toUpperCase() + interest.status.slice(1) : "Blocked") + " — " + (blockers.length ? blockers.join("; ") : "Admin check — Queue/defer blocker not recorded") + "; " + pending };
    if (b && s) {
      if (!match) return check("Both final approvals saved; linked match missing");
      if (match.contactGate !== "pending_admin_approval" || !["new", "reviewing"].includes(match.status)) return check("Both final approvals saved; contact-release gate is not ready");
      const flows = await linkedFlows(ctx, interest);
      if (flows.some(f => f.requesterFinalApproval !== "approved" || f.recipientFinalApproval !== "approved")) return check("Linked final approval records disagree");
      await assertParticipantsAvailable(ctx, brother._id, sister._id, match._id);
      if ([brother, sister].some(p => !p.email || !p.phone)) return check("Both final approvals saved; applicant contact details missing");
      return { label: "Admin action — Review and release contacts (both final approvals saved)" };
    }
    return { label: pending };
  } catch (error) {
    return check(error instanceof Error ? error.message : "Workflow records unavailable");
  }
}
