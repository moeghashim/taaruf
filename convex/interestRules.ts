import { isSecurityRetired } from "./registrationSecurity";
import { matchesInterestFirstName } from "./interestIdentity";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { findEligibleInterestSubmissionEvent } from "./eventRules";

export const openInterestStatuses = ["new", "queued", "active", "deferred"] as const;
export const slotFreeingInterestStatuses = ["declined", "withdrawn", "closed", "converted_to_match"] as const;

type ReadCtx = QueryCtx | MutationCtx;
type InterestStatus = Doc<"interests">["status"];
type InterestSource = Doc<"interests">["source"];

const openInterestStatusSet = new Set<InterestStatus>(openInterestStatuses);

export async function createInitialInterestFlow(ctx: MutationCtx, interest: Doc<"interests">) {
  const now = Date.now();
  const existingFlow = await ctx.db
    .query("interestFlows")
    .withIndex("by_interestId", (q) => q.eq("interestId", interest._id))
    .unique();

  if (existingFlow) return existingFlow._id;

  const flowStatus =
    interest.visibility === "internal_only" ? "private_documented" as const : "awaiting_inbound_response" as const;
  const flowId = await ctx.db.insert("interestFlows", {
    interestId: interest._id,
    fromRegistrationId: interest.fromRegistrationId,
    toRegistrationId: interest.toRegistrationId,
    flowStatus,
    recipientDecision: "pending",
    requesterFinalApproval: "pending",
    recipientFinalApproval: "pending",
    photoDecision: "pending",
    createdAt: now,
    updatedAt: now,
  });

  await ctx.db.insert("interestFlowEvents", {
    interestFlowId: flowId,
    interestId: interest._id,
    actor: "system",
    eventType: "flow_created",
    createdAt: now,
  });

  return flowId;
}

export async function getRegistrationOrThrow(ctx: ReadCtx, id: Id<"registrations">) {
  const registration = await ctx.db.get(id);
  if (!registration) {
    throw new Error("Registration not found");
  }
  return registration;
}

/** Archive is independent of search status and consent. */
export function assertNotArchived(registration: Doc<"registrations">) {
  if ((registration.archivedAt !== undefined || isSecurityRetired(registration))) throw new Error("Archived applicants cannot participate in matching");
}

export async function assertMatchingParticipants(ctx: ReadCtx, ...ids: Id<"registrations">[]) {
  for (const id of ids) assertNotArchived(await getRegistrationOrThrow(ctx, id));
}

export function isProfileCompleted(registration: Doc<"registrations">) {
  return registration.profileCompletionStatus === "completed";
}

export function assertProfileCompleted(registration: Doc<"registrations">, label: string) {
  if (!isProfileCompleted(registration)) {
    throw new Error(`${label} must complete their profile before matching can begin`);
  }
}

export function deriveVisibility(fromGender: "male" | "female", toGender: "male" | "female") {
  if (fromGender === toGender) {
    throw new Error("Interest must be between opposite-gender applicants");
  }

  if (fromGender === "female" && toGender === "male") {
    return "internal_only" as const;
  }

  return "admin_actionable" as const;
}


async function assertNoDuplicateOpenInterest(
  ctx: ReadCtx,
  fromRegistrationId: Id<"registrations">,
  toRegistrationId: Id<"registrations">,
  eventId: Id<"events">
) {
  const existingInterests = ctx.db
    .query("interests")
    .withIndex("by_fromRegistrationId_and_toRegistrationId_and_eventId", (q) =>
      q.eq("fromRegistrationId", fromRegistrationId).eq("toRegistrationId", toRegistrationId).eq("eventId", eventId)
    );

  for await (const interest of existingInterests) {
    if (openInterestStatusSet.has(interest.status)) throw new Error("An open interest already exists for this applicant pair at this event");
  }
}

async function countOpenOutboundInterests(
  ctx: ReadCtx,
  fromRegistrationId: Id<"registrations">,
  max: number
) {
  let count = 0;

  for (const status of openInterestStatuses) {
    const rows = await ctx.db
      .query("interests")
      .withIndex("by_fromRegistrationId_and_status", (q) =>
        q.eq("fromRegistrationId", fromRegistrationId).eq("status", status)
      )
      .take(max + 1);
    count += rows.length;
    if (count >= max) return count;
  }

  return count;
}

export async function assertOpenInterestCap(
  ctx: ReadCtx,
  fromRegistrationId: Id<"registrations">,
  max = 3
) {
  const openInterestCount = await countOpenOutboundInterests(ctx, fromRegistrationId, max);
  if (openInterestCount >= max) {
    throw new Error(`Applicant already has ${max} open interests`);
  }
}

export async function assertCanCreateInterest(
  ctx: ReadCtx,
  fromRegistrationId: Id<"registrations">,
  toRegistrationId: Id<"registrations">,
  eventId: Id<"events">,
  applicantSubmission = false
) {
  if (fromRegistrationId === toRegistrationId) {
    throw new Error("Applicant cannot express interest in themselves");
  }

  const fromRegistration = await getRegistrationOrThrow(ctx, fromRegistrationId);
  const toRegistration = await getRegistrationOrThrow(ctx, toRegistrationId);
  assertNotArchived(fromRegistration);
  assertNotArchived(toRegistration);
  const visibility = deriveVisibility(fromRegistration.gender, toRegistration.gender);

  assertProfileCompleted(fromRegistration, "Requester");
  assertProfileCompleted(toRegistration, "Recipient");
  if (!applicantSubmission) await assertOpenInterestCap(ctx, fromRegistrationId);
  await assertNoDuplicateOpenInterest(ctx, fromRegistrationId, toRegistrationId, eventId);

  return {
    fromRegistration,
    toRegistration,
    visibility,
    initialStatus: fromRegistration.activeMatchId || toRegistration.activeMatchId ? "queued" as const : "new" as const,
  };
}

export async function createInterestWithRules(
  ctx: MutationCtx,
  args: {
    fromRegistrationId: Id<"registrations">;
    toRegistrationId: Id<"registrations">;
    eventId: Id<"events">;
    rank?: number;
    source: InterestSource;
    notes?: string;
  }
) {
  const event = await ctx.db.get(args.eventId);
  if (!event) {
    throw new Error("Interest event not found");
  }

  if (event.eventCode !== "manual-admin" && event.interestSubmissionsEnabled !== true) {
    throw new Error("Interest submissions are closed for this event");
  }

  const { visibility, initialStatus } = await assertCanCreateInterest(
    ctx,
    args.fromRegistrationId,
    args.toRegistrationId,
    args.eventId,
    args.source === "platform_submission"
  );
  const now = Date.now();
  const interestId = await ctx.db.insert("interests", {
    fromRegistrationId: args.fromRegistrationId,
    toRegistrationId: args.toRegistrationId,
    eventId: args.eventId,
    rank: args.rank,
    source: args.source,
    ...(visibility === "internal_only" ? { femaleWorkflow: { state: "private_documented" as const } } : {}),
    status: initialStatus,
    visibility,
    adminStatus: "pending",
    notes: args.notes,
    createdAt: now,
    updatedAt: now,
  });

  const interest = await ctx.db.get(interestId);
  if (!interest || interest.testReset) {
    throw new Error("Interest not found after creation");
  }
  await createInitialInterestFlow(ctx, interest);

  if (initialStatus === "queued") {
    return { interestId, matchId: null };
  }

  // Reciprocal submissions are signals, never explicit final consent.
  return { interestId, matchId: null };
}

export async function createApplicantInterestWithRules(
  ctx: MutationCtx,
  args: {
    fromRegistrationId: Id<"registrations">;
    toRegistrationId: Id<"registrations">;
    rank?: number;
    source: InterestSource;
    notes?: string;
    applicantName?: string;
  }
) {
  // Old profile-number fields remain stored but cannot create new unverified interests.
  if (!args.applicantName) throw new Error("Applicant must have attended an event and verified the applicant name using Submit Interest");
  const recipient = await getRegistrationOrThrow(ctx, args.toRegistrationId);
  if (!matchesInterestFirstName(recipient.name, args.applicantName)) throw new Error("Applicant details could not be verified");
  const event = await findEligibleInterestSubmissionEvent(ctx, args.fromRegistrationId);
  if (!event) {
    throw new Error("Interest submissions are closed or you are not approved and checked in for the selected event");
  }

  const target = await getRegistrationOrThrow(ctx, args.toRegistrationId);
  if (target.status !== "approved") throw new Error("Applicant details could not be verified");
  const submissions = await ctx.db.query("interests")
    .withIndex("by_submission_quota", q => q.eq("fromRegistrationId", args.fromRegistrationId).eq("eventId", event._id).eq("source", "platform_submission").eq("testReset", undefined).eq("slotReturnedAt", undefined)).take(3);
  if (submissions.some(row => row.toRegistrationId === args.toRegistrationId)) throw new Error("Interest already submitted for this event");
  if (submissions.length >= 3) {
    throw new Error("You can submit a maximum of 3 interests per event");
  }
  const { applicantName, ...interestArgs } = args;
  void applicantName;
  return await createInterestWithRules(ctx, {
    ...interestArgs,
    source: "platform_submission",
    eventId: event._id,
  });
}

export async function activateInterestAndQueueCompetitors(
  ctx: MutationCtx,
  interestId: Id<"interests">
) {
  const interest = await ctx.db.get(interestId);
  if (!interest || interest.testReset) {
    throw new Error("Interest not found");
  }

  await assertMatchingParticipants(ctx, interest.fromRegistrationId, interest.toRegistrationId);
  const now = Date.now();
  const inboundCompetitors = await ctx.db
    .query("interests")
    .withIndex("by_toRegistrationId", (q) => q.eq("toRegistrationId", interest.toRegistrationId))
    .take(1000);
  const outboundAlternatives = await ctx.db
    .query("interests")
    .withIndex("by_fromRegistrationId", (q) => q.eq("fromRegistrationId", interest.fromRegistrationId))
    .take(1000);

  for (const competitor of inboundCompetitors) {
    if (competitor._id === interest._id) continue;
    if (!openInterestStatusSet.has(competitor.status)) continue;
    await ctx.db.patch(competitor._id, {
      status: "queued",
      updatedAt: now,
    });
  }

  for (const alternative of outboundAlternatives) {
    if (alternative._id === interest._id) continue;
    if (!openInterestStatusSet.has(alternative.status)) continue;
    await ctx.db.patch(alternative._id, {
      status: "queued",
      updatedAt: now,
    });
  }

  await ctx.db.patch(interestId, {
    status: "active",
    updatedAt: now,
  });

  return interestId;
}

async function getQueuedInterestsForRegistration(ctx: MutationCtx, registrationId: Id<"registrations">) {
  const outbound = await ctx.db
    .query("interests")
    .withIndex("by_fromRegistrationId_and_status", (q) =>
      q.eq("fromRegistrationId", registrationId).eq("status", "queued")
    )
    .take(1000);
  const inbound = await ctx.db
    .query("interests")
    .withIndex("by_toRegistrationId_and_status", (q) =>
      q.eq("toRegistrationId", registrationId).eq("status", "queued")
    )
    .take(1000);

  return [...outbound, ...inbound]
    .filter((interest, index, all) => all.findIndex((candidate) => candidate._id === interest._id) === index)
    .sort((a, b) => a.createdAt - b.createdAt || a._creationTime - b._creationTime);
}

export async function promoteOldestQueuedForRegistration(
  ctx: MutationCtx,
  registrationId: Id<"registrations">
) {
  const registration = await ctx.db.get(registrationId);
  if (!registration || (registration.archivedAt !== undefined || isSecurityRetired(registration))) return null;
  for (const queued of await getQueuedInterestsForRegistration(ctx, registrationId)) {
    const pair = await Promise.all([ctx.db.get(queued.fromRegistrationId), ctx.db.get(queued.toRegistrationId)]);
    if (pair.some(person => !person || (person.archivedAt !== undefined || isSecurityRetired(person)))) continue;
    await activateInterestAndQueueCompetitors(ctx, queued._id);
    return queued._id;
  }
  return null;
}

export async function demoteOpenInterestsInvolvingRegistration(
  ctx: MutationCtx,
  registrationId: Id<"registrations">,
  excludeMatchId?: Id<"matches">
) {
  const now = Date.now();
  const idsToDemote = new Set<Id<"interests">>();

  for (const status of ["new", "active"] as const) {
    const outbound = await ctx.db
      .query("interests")
      .withIndex("by_fromRegistrationId_and_status", (q) =>
        q.eq("fromRegistrationId", registrationId).eq("status", status)
      )
      .take(1000);
    const inbound = await ctx.db
      .query("interests")
      .withIndex("by_toRegistrationId_and_status", (q) =>
        q.eq("toRegistrationId", registrationId).eq("status", status)
      )
      .take(1000);

    for (const interest of [...outbound, ...inbound]) {
      if (excludeMatchId && interest.matchId === excludeMatchId) continue;
      idsToDemote.add(interest._id);
    }
  }

  for (const interestId of idsToDemote) {
    await ctx.db.patch(interestId, {
      status: "queued",
      updatedAt: now,
    });
  }

  return [...idsToDemote];
}
