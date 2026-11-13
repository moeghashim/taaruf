import { isSecurityRetired } from "./registrationSecurity";
import { assertNotArchived } from "./archiveRules";
import { sisterActivation } from "./sisterConfirmationActivation";
import { isManualMatchDraft } from "../src/lib/manual-match-draft";
import { deliveryAuthorized, reviewActivation } from "./brotherReviewActivation";
import { deliveryConfig } from "./femaleWorkflowDelivery";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
type ReadCtx = MutationCtx | QueryCtx;
/** Shared outbox retains its original table name for compatibility. */
export async function enqueueContactDelivery(ctx: MutationCtx, interestId: Id<"interests">, recipientId: Id<"registrations">, kind: Doc<"femaleWorkflowDeliveries">["kind"]) {
  const source = await ctx.db.get(interestId);
  if (!source) throw new Error("Interest unavailable");
  assertNotArchived(await ctx.db.get(source.fromRegistrationId));
  assertNotArchived(await ctx.db.get(source.toRegistrationId));
  const key = interestId + ":" + kind + ":" + recipientId;
  if (await ctx.db.query("femaleWorkflowDeliveries").withIndex("by_key", q => q.eq("key", key)).unique()) return;
  const createdAt = Date.now();
  const reviewActivationAt = kind === "brother_review" ? await reviewActivation(ctx) : null;
  const sisterActivationAt = kind === "sister_confirmation" ? await sisterActivation(ctx) : null;
  const interest = kind === "sister_confirmation" ? await ctx.db.get(interestId) : null;
  const authorized = await deliveryAuthorized(ctx, { kind, createdAt, reviewActivationAt: reviewActivationAt ?? undefined, sisterActivationAt: sisterActivationAt ?? undefined });
  const recipient = ["brother_review", "sister_confirmation"].includes(kind) ? await ctx.db.get(recipientId) : null;
  const ready = !["brother_review", "sister_confirmation"].includes(kind) || (authorized && !!recipient && !!deliveryConfig(recipient.email));
  // Record ineligible shares too: reissue must not turn a preactivation share into a future send.
  await ctx.db.insert("femaleWorkflowDeliveries", { interestId, recipientId, kind, key, status: ready ? "pending" : "failed", attempts: 0, nextAttemptAt: createdAt, createdAt, ...(kind === "sister_confirmation" ? { sisterAcceptedAt: interest?.femaleWorkflow?.brotherAcceptedAt, sisterRecipientEmail: recipient?.email } : {}), ...(ready && sisterActivationAt !== null ? { sisterActivationAt } : {}), ...(ready && reviewActivationAt !== null ? { reviewActivationAt } : {}), ...(ready ? {} : { error: "Review notification not activated/configured at share time; no backfill" }) });
}
/** Validate both directions of the link before trusting any consent metadata. */
export function assertMatchInterest(match: Doc<"matches">, interest: Doc<"interests">) {
  const { fromRegistrationId: from, toRegistrationId: to } = interest;
  if (from === to || match.maleRegistrationId === match.femaleRegistrationId ||
      interest.matchId !== match._id ||
      !((from === match.maleRegistrationId && to === match.femaleRegistrationId) ||
        (from === match.femaleRegistrationId && to === match.maleRegistrationId))) {
    throw new Error("Linked pair mismatch");
  }
}
export async function linkedFlows(ctx: ReadCtx, interest: Doc<"interests">) {
  assertNotArchived(await ctx.db.get(interest.fromRegistrationId));
  assertNotArchived(await ctx.db.get(interest.toRegistrationId));
  if (interest.fromRegistrationId === interest.toRegistrationId) throw new Error("Linked pair mismatch");
  let eventId = interest.eventId;
  if (interest.matchId) {
    const match = await ctx.db.get(interest.matchId);
    if (!match) throw new Error("Linked match missing");
    if (match.closedReason === "participant_archived") throw new Error("Match is not active");
    assertMatchInterest(match, interest);
    const primary = match.interestId ? await ctx.db.get(match.interestId) : null;
    if (!primary) throw new Error("Linked interest missing");
    assertMatchInterest(match, primary);
    eventId = primary.eventId;
  }
  const interests = interest.matchId ? await ctx.db.query("interests").withIndex("by_matchId", q => q.eq("matchId", interest.matchId)).collect() : [interest];
  const flows = [];
  for (const row of interests) {
    if (row.eventId !== eventId) throw new Error("Linked event mismatch");
    if (row.testReset || ["closed", "declined", "withdrawn"].includes(row.status)) throw new Error("Interest is no longer active");
    if (row.fromRegistrationId === row.toRegistrationId) throw new Error("Linked pair mismatch");
    if (!([interest.fromRegistrationId, interest.toRegistrationId].includes(row.fromRegistrationId) && [interest.fromRegistrationId, interest.toRegistrationId].includes(row.toRegistrationId))) throw new Error("Linked pair mismatch");
    const flow = await ctx.db.query("interestFlows").withIndex("by_interestId", q => q.eq("interestId", row._id)).unique();
    if (!flow) throw new Error("Linked flow missing; explicit consent required");
    if (flow.fromRegistrationId !== row.fromRegistrationId || flow.toRegistrationId !== row.toRegistrationId) throw new Error("Linked flow identity mismatch");
    if (flow.closedReason === "participant_archived" || ["closed", "declined"].includes(flow.flowStatus)) throw new Error("Interest is no longer active");
    flows.push(flow);
  }
  return flows;
}
export async function queuePendingReview(ctx: MutationCtx, matchId: Id<"matches">) {
  const match = await ctx.db.get(matchId);
  if (!match?.interestId || match.testResetAt || ["closed", "declined", "paused"].includes(match.status)) throw new Error("Match is not active");
  const interest = await ctx.db.get(match.interestId);
  if (!interest) throw new Error("Linked interest missing");
  assertMatchInterest(match, interest);
  const flows = await linkedFlows(ctx, interest);
  if (flows.some(f => f.requesterFinalApproval !== "approved" || f.recipientFinalApproval !== "approved")) throw new Error("Both applicants must give final approval");
  if (match.status === "contact_shared" || match.contactGate === "contacts_released") return;
  await ctx.db.patch(matchId, { status: "reviewing", contactGate: "pending_admin_approval", updatedAt: Date.now() });
  for (const id of [match.maleRegistrationId, match.femaleRegistrationId]) await enqueueContactDelivery(ctx, match.interestId, id, "pending_review");
}
/** Preserve disclosure history, but never treat archive-closed history as access. */
export async function contactsVisible(ctx: ReadCtx, interest: Doc<"interests">, flow: Doc<"interestFlows"> | null) {
  if (!flow?.contactSharedAt || flow.closedReason === "participant_archived" || ["closed", "declined"].includes(flow.flowStatus)) return false;
  const from = await ctx.db.get(interest.fromRegistrationId);
  const to = await ctx.db.get(interest.toRegistrationId);
  if (!from || !to || (from.archivedAt !== undefined || isSecurityRetired(from)) || (to.archivedAt !== undefined || isSecurityRetired(to))) return false;
  if ([from, to].some(person => person.lastRestoredArchivedAt !== undefined && interest.createdAt <= person.lastRestoredArchivedAt)) return false;
  const match = interest.matchId ? await ctx.db.get(interest.matchId) : null;
  if (interest.matchId) {
    if (!match || match.testResetAt !== undefined) return false;
    try { assertMatchInterest(match, interest); await linkedFlows(ctx, interest); } catch { return false; }
  }
  return !match?.contactGate || match.contactGate === "contacts_released";
}
export async function deliveryParticipants(ctx: ReadCtx, interestId: Id<"interests">) {
  const interest = await ctx.db.get(interestId);
  if (!interest || interest.testReset || ["closed", "declined", "withdrawn"].includes(interest.status)) throw new Error("Unavailable");
  const match = interest.matchId ? await ctx.db.get(interest.matchId) : null;
  if (!match || match.testResetAt || ["closed", "declined"].includes(match.status)) throw new Error("Unavailable");
  assertMatchInterest(match, interest);
  await linkedFlows(ctx, interest);
  const sister = await ctx.db.get(match.femaleRegistrationId);
  const brother = await ctx.db.get(match.maleRegistrationId);
  if (!sister || !brother || sister.status !== "approved" || brother.status !== "approved") throw new Error("Unavailable");
  return { sister, brother, workflow: { state: match.contactGate } };
}

export async function assertParticipantsAvailable(ctx: ReadCtx, maleId: Id<"registrations">, femaleId: Id<"registrations">, except?: Id<"matches">) {
  const male = await ctx.db.get(maleId);
  const female = await ctx.db.get(femaleId);
  if (!male || !female || maleId === femaleId || male.gender !== "male" || female.gender !== "female") throw new Error("Linked pair mismatch");
  for (const person of [male, female]) {
    assertNotArchived(person);
    if (person.status !== "approved") throw new Error("Both applicants must be approved");
    if (person.activeMatchId && person.activeMatchId !== except) throw new Error("Applicant already has an active match");
  }
  const maleMatches = await ctx.db.query("matches").withIndex("by_maleRegistrationId", q => q.eq("maleRegistrationId", maleId)).take(1001);
  const femaleMatches = await ctx.db.query("matches").withIndex("by_femaleRegistrationId", q => q.eq("femaleRegistrationId", femaleId)).take(1001);
  if (maleMatches.length > 1000 || femaleMatches.length > 1000) throw new Error("Match history requires manual review");
  const matches = [...maleMatches, ...femaleMatches];
  if (matches.some(m => !isManualMatchDraft(m) && m._id !== except && m.testResetAt === undefined && !["closed", "declined", "paused"].includes(m.status))) throw new Error("Applicant already has an active match");
  return { male, female };
}

/** Include inactive rows as negative provenance only, never as reusable consent. */
async function pairHistory(ctx: ReadCtx, interest: Doc<"interests">) {
  const rows: Doc<"interests">[] = [];
  for (const [from, to] of [[interest.fromRegistrationId, interest.toRegistrationId], [interest.toRegistrationId, interest.fromRegistrationId]]) {
    const direction = await ctx.db.query("interests").withIndex("by_fromRegistrationId_and_toRegistrationId_and_eventId", q => q.eq("fromRegistrationId", from).eq("toRegistrationId", to).eq("eventId", interest.eventId)).take(1001);
    if (direction.length > 1000) throw new Error("Pair history requires manual review");
    rows.push(...direction);
  }
  return rows;
}

export async function pairFlows(ctx: ReadCtx, interest: Doc<"interests">) {
  assertNotArchived(await ctx.db.get(interest.fromRegistrationId));
  assertNotArchived(await ctx.db.get(interest.toRegistrationId));
  if (interest.testReset || ["closed", "declined", "withdrawn"].includes(interest.status)) throw new Error("Interest is no longer active");
  if (interest.fromRegistrationId === interest.toRegistrationId) throw new Error("Linked pair mismatch");
  const rows = await pairHistory(ctx, interest);
  const result = [];
  for (const row of rows) {
    if (row.testReset || ["closed", "declined", "withdrawn"].includes(row.status) || (row.femaleWorkflow && ["declined", "revoked"].includes(row.femaleWorkflow.state))) continue;
    const flow = await ctx.db.query("interestFlows").withIndex("by_interestId", q => q.eq("interestId", row._id)).unique();
    if (!flow) throw new Error("Linked flow missing; explicit consent required");
    if (flow.fromRegistrationId !== row.fromRegistrationId || flow.toRegistrationId !== row.toRegistrationId) throw new Error("Linked flow identity mismatch");
    if (flow.closedReason === "participant_archived" || ["closed", "declined"].includes(flow.flowStatus)) throw new Error("Interest is no longer active");
    if (row.matchId) {
      const match = await ctx.db.get(row.matchId);
      if (!match) throw new Error("Linked match missing");
      assertMatchInterest(match, row);
      await linkedFlows(ctx, row);
      if (match.closedReason === "participant_archived" || match.testResetAt !== undefined || ["closed", "declined", "paused"].includes(match.status)) throw new Error("Match is not active");
    }
    result.push({ interest: row, flow });
  }
  if (new Set(result.flatMap(r => r.interest.matchId ? [r.interest.matchId] : [])).size > 1) throw new Error("Linked match mismatch");
  return result;
}

/** Provenance belongs only to the source explicit action, never propagated flags. */
export async function recordPairApproval(ctx: MutationCtx, interest: Doc<"interests">, actorId: Id<"registrations">, approved: boolean) {
  if (![interest.fromRegistrationId, interest.toRegistrationId].includes(actorId)) throw new Error("Unauthorized");
  const rows = await pairFlows(ctx, interest);
  if (interest.matchId && rows.some(r => r.interest.femaleWorkflow)) {
    if (approved) return interest.matchId;
    throw new Error("Close or pause the official connection instead");
  }
  const source = rows.find(r => r.interest._id === interest._id);
  if (!source) throw new Error("Interest unavailable");
  const now = Date.now();
  const requester = source.flow.fromRegistrationId === actorId;
  const previous = requester ? source.flow.requesterFinalApproval : source.flow.recipientFinalApproval;
  const evidence = requester ? source.flow.requesterExplicitFinalAt : source.flow.recipientExplicitFinalAt;
  if (previous === "declined" || (evidence !== undefined && !approved)) throw new Error("Final approval has already been recorded for this interest");
  if (approved) {
    if (evidence === undefined) {
      await ctx.db.patch(source.flow._id, {
        ...(requester ? { requesterFinalApproval: "approved" as const, requesterFinalApprovalAt: now, requesterExplicitFinalAt: now } : { recipientFinalApproval: "approved" as const, recipientFinalApprovalAt: now, recipientExplicitFinalAt: now }), updatedAt: now,
      });
      await ctx.db.insert("interestFlowEvents", { interestFlowId: source.flow._id, interestId: interest._id, actor: "applicant", actorRegistrationId: actorId, eventType: "explicit_final_approval_given", createdAt: now });
    }
    return await joinApprovedPair(ctx, interest);
  }
  for (const {interest: row, flow} of rows) {
    await ctx.db.patch(flow._id, { ...(flow.fromRegistrationId === actorId ? { requesterFinalApproval: "declined" as const, requesterFinalApprovalAt: now } : { recipientFinalApproval: "declined" as const, recipientFinalApprovalAt: now }), flowStatus: "declined", updatedAt: now });
    await ctx.db.patch(row._id, { status: "declined", adminStatus: "declined", ...(row.femaleWorkflow ? { femaleWorkflow: { ...row.femaleWorkflow, state: "declined" as const } } : {}), updatedAt: now });
    await ctx.db.insert("interestFlowEvents", { interestFlowId: flow._id, interestId: row._id, actor: "applicant", actorRegistrationId: actorId, eventType: "final_approval_declined", createdAt: now });
  }
  return null;
}

/** Old final events were propagated. Acceptance-time male events are ambiguous
 * even on reciprocal rows; retain them as history, not consent for a new join. */
async function pairDecisions(ctx: ReadCtx, rows: Awaited<ReturnType<typeof pairFlows>>) {
  const decisions = new Map<Id<"registrations">, number>();
  const history = rows.length ? await pairHistory(ctx, rows[0].interest) : [];
  const hasFemaleWorkflow = history.some(row => row.femaleWorkflow);
  // A contradictory active final is not resolved by row order or propagation.
  if (rows.some(({flow}) => flow.requesterFinalApproval === "declined" || flow.recipientFinalApproval === "declined")) return decisions;
  for (const {interest, flow} of rows) {
    for (const [id, approval, explicit, at] of [
      [flow.fromRegistrationId, flow.requesterFinalApproval, flow.requesterExplicitFinalAt, flow.requesterFinalApprovalAt],
      [flow.toRegistrationId, flow.recipientFinalApproval, flow.recipientExplicitFinalAt, flow.recipientFinalApprovalAt],
    ] as const) {
      if (approval !== "approved") continue;
      if (explicit !== undefined) { decisions.set(id, explicit); continue; }
      if (!hasFemaleWorkflow) { decisions.set(id, at ?? flow.updatedAt); continue; }
      const ambiguous = history.some(row => row.femaleWorkflow && row.toRegistrationId === id && (row._id === interest._id || row.femaleWorkflow.brotherAcceptedAt === undefined || row.femaleWorkflow.brotherAcceptedAt === at));
      if (ambiguous || at === undefined) continue;
      const events = await ctx.db.query("interestFlowEvents").withIndex("by_interestId", q => q.eq("interestId", interest._id)).take(1001);
      if (events.length > 1000) throw new Error("Consent history requires manual review");
      if (events.some(e => e.actor === "applicant" && e.actorRegistrationId === id && e.eventType === "final_approval_given" && e.createdAt === at)) decisions.set(id, at);
    }
  }
  return decisions;
}

export async function joinApprovedPair(ctx: MutationCtx, interest: Doc<"interests">) {
  const rows = await pairFlows(ctx, interest);
  const decisions = await pairDecisions(ctx, rows);
  if (!decisions.has(interest.fromRegistrationId) || !decisions.has(interest.toRegistrationId)) return null;
  let matchId = rows.find(r => r.interest.matchId)?.interest.matchId;
  const from = await ctx.db.get(interest.fromRegistrationId);
  const to = await ctx.db.get(interest.toRegistrationId);
  if (!from || !to) throw new Error("Applicants unavailable");
  const maleId = from.gender === "male" ? from._id : to._id;
  const femaleId = from.gender === "female" ? from._id : to._id;
  await assertParticipantsAvailable(ctx, maleId, femaleId, matchId);
  const now = Date.now();
  if (!matchId) matchId = await ctx.db.insert("matches", { maleRegistrationId: maleId, femaleRegistrationId: femaleId, interestId: interest._id, interestType: "mutual_interest", status: "reviewing", contactGate: "pending_admin_approval", initiatedBy: "interest_signal", createdAt: now, updatedAt: now });
  const match = (await ctx.db.get(matchId))!;
  const releasedAt = match.adminReleasedAt ?? rows.find(r => r.flow.contactSharedAt !== undefined)?.flow.contactSharedAt;
  const released = match.contactGate === "contacts_released" || (!match.contactGate && releasedAt !== undefined);
  for (const { interest: row, flow } of rows) {
    await ctx.db.patch(row._id, { matchId, status: "converted_to_match", adminStatus: "matched", ...(row.femaleWorkflow ? { femaleWorkflow: { ...row.femaleWorkflow, state: row.femaleWorkflow.state === "private_documented" || !row.femaleWorkflow.reviewTokenHash ? "private_documented" as const : released ? "contacts_released" as const : "pending_admin_approval" as const, brotherAcceptedAt: row.femaleWorkflow.brotherAcceptedAt, sisterConfirmedAt: decisions.get(femaleId), ...(released ? { adminReleasedAt: releasedAt } : {}) } } : {}), updatedAt: now });
    await ctx.db.patch(flow._id, { requesterFinalApproval: "approved", recipientFinalApproval: "approved", requesterFinalApprovalAt: decisions.get(row.fromRegistrationId), recipientFinalApprovalAt: decisions.get(row.toRegistrationId), flowStatus: released ? "contact_shared" : "awaiting_final_approvals", bioVisibleAt: flow.bioVisibleAt ?? now, ...(released ? { contactSharedAt: flow.contactSharedAt ?? releasedAt } : {}), updatedAt: now });
  }
  if (!released) await queuePendingReview(ctx, matchId);
  return matchId;
}

export async function releasePairContacts(ctx: MutationCtx, match: Doc<"matches">) {
  if (match.closedReason === "participant_archived" || match.testResetAt !== undefined || ["closed", "declined", "paused"].includes(match.status)) throw new Error("Match is not active");
  if (!match.interestId && match.matchmakerPresentedAt !== undefined) {
    if (match.matchmakerWithdrawnAt !== undefined || match.maleMatchmakerApprovalAt === undefined || match.femaleMatchmakerApprovalAt === undefined) throw new Error("Both applicants must give final approval before contacts can be shared");
    const {male, female} = await assertParticipantsAvailable(ctx, match.maleRegistrationId, match.femaleRegistrationId, match._id);
    if ([male, female].some(p => !p.email || !p.phone)) throw new Error("Both applicants must have contact details");
    const now = Date.now();
    await ctx.db.patch(match._id, {status: "contact_shared", contactGate: "contacts_released", adminReleasedAt: match.adminReleasedAt ?? now, updatedAt: now});
    for (const p of [male, female]) await ctx.db.patch(p._id, {activeMatchId: match._id});
    return;
  }
  const interest = match.interestId ? await ctx.db.get(match.interestId) : null;
  if (!interest) throw new Error("Active linked interest required");
  assertMatchInterest(match, interest);
  const flows = await linkedFlows(ctx, interest);
  if (flows.some(f => f.requesterFinalApproval !== "approved" || f.recipientFinalApproval !== "approved")) throw new Error("Both applicants must give final approval before contacts can be shared");
  const { male, female } = await assertParticipantsAvailable(ctx, match.maleRegistrationId, match.femaleRegistrationId, match._id);
  if ([male, female].some(p => !p.email || !p.phone)) throw new Error("Both applicants must have contact details");
  const alreadyReleased = match.contactGate === "contacts_released" || (!match.contactGate && flows.some(f => f.contactSharedAt !== undefined));
  const now = Date.now();
  if (!alreadyReleased) {
    await ctx.db.patch(match._id, { contactGate: "contacts_released", adminReleasedAt: now });
    for (const flow of flows) {
      await ctx.db.patch(flow._id, { flowStatus: "contact_shared", contactSharedAt: now, updatedAt: now });
      const row = (await ctx.db.get(flow.interestId))!;
      if (row.femaleWorkflow) await ctx.db.patch(row._id, { femaleWorkflow: { ...row.femaleWorkflow, state: row.femaleWorkflow.state === "private_documented" || !row.femaleWorkflow.reviewTokenHash ? "private_documented" : "contacts_released", adminReleasedAt: now }, updatedAt: now });
      await ctx.db.insert("interestFlowEvents", { interestFlowId: flow._id, interestId: flow.interestId, actor: "system", eventType: "contacts_disclosed_in_portal", createdAt: now });
    }
    for (const person of [male, female]) await enqueueContactDelivery(ctx, interest._id, person._id, "contacts_ready");
  }
  await ctx.db.patch(match._id, { status: "contact_shared", updatedAt: now });
  for (const person of [male, female]) await ctx.db.patch(person._id, { activeMatchId: match._id });
}

export async function setPairPaused(ctx: MutationCtx, match: Doc<"matches">, paused: boolean, actorId?: Id<"registrations">) {
  if (isManualMatchDraft(match)) throw new Error("Private drafts can only be edited or closed; presentation is not available yet");
  if (match.closedReason === "participant_archived" || match.testResetAt !== undefined || ["closed", "declined"].includes(match.status)) throw new Error("Match is not active");
  if (actorId && ![match.maleRegistrationId, match.femaleRegistrationId].includes(actorId)) throw new Error("Unauthorized");
  const primary = match.interestId ? await ctx.db.get(match.interestId) : null;
  const flows = primary ? await linkedFlows(ctx, primary) : [];
  if (match.interestId && !primary) throw new Error("Linked interest missing");
  if (primary) assertMatchInterest(match, primary);
  const male = await ctx.db.get(match.maleRegistrationId);
  const female = await ctx.db.get(match.femaleRegistrationId);
  if (!male || !female || male.gender !== "male" || female.gender !== "female" || male._id === female._id) throw new Error("Linked pair mismatch");
  if (!paused) await assertParticipantsAvailable(ctx, male._id, female._id, match._id);
  if ((match.status === "paused") === paused) return match._id;
  const released = match.status === "contact_shared" || match.adminReleasedAt !== undefined || match.contactSharedNotificationSentAt !== undefined || match.contactGate === "contacts_released" || (!match.contactGate && flows.some(f => f.contactSharedAt !== undefined));
  const status = paused ? "paused" : released ? "contact_shared" : "reviewing";
  await ctx.db.patch(match._id, { status, ...(released && !match.interestId ? { contactGate: "contacts_released" as const } : {}), updatedAt: Date.now() });
  for (const person of [male, female]) {
    if (paused && person.activeMatchId === match._id) await ctx.db.patch(person._id, { activeMatchId: undefined });
    if (!paused && released) await ctx.db.patch(person._id, { activeMatchId: match._id });
  }
  for (const flow of flows) await ctx.db.insert("interestFlowEvents", { interestFlowId: flow._id, interestId: flow.interestId, actor: actorId ? "applicant" : "system", ...(actorId ? { actorRegistrationId: actorId } : {}), eventType: paused ? "match_paused" : "match_resumed", createdAt: Date.now() });
  return match._id;
}
