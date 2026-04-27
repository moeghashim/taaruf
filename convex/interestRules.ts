import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export const openInterestStatuses = ["new", "queued", "active", "deferred"] as const;
export const slotFreeingInterestStatuses = ["declined", "withdrawn", "closed", "converted_to_match"] as const;

type ReadCtx = QueryCtx | MutationCtx;
type InterestStatus = Doc<"interests">["status"];
type InterestSource = Doc<"interests">["source"];

const openInterestStatusSet = new Set<InterestStatus>(openInterestStatuses);

export async function getRegistrationOrThrow(ctx: ReadCtx, id: Id<"registrations">) {
  const registration = await ctx.db.get(id);
  if (!registration) {
    throw new Error("Registration not found");
  }
  return registration;
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

export function deriveInterestType(fromGender: "male" | "female") {
  return fromGender === "male" ? "man_interested" : "woman_interested";
}

async function assertNoDuplicateOpenInterest(
  ctx: ReadCtx,
  fromRegistrationId: Id<"registrations">,
  toRegistrationId: Id<"registrations">
) {
  const existingInterests = await ctx.db
    .query("interests")
    .withIndex("by_fromRegistrationId_and_toRegistrationId", (q) =>
      q.eq("fromRegistrationId", fromRegistrationId).eq("toRegistrationId", toRegistrationId)
    )
    .take(20);

  const duplicateOpenInterest = existingInterests.find((interest) =>
    openInterestStatusSet.has(interest.status)
  );

  if (duplicateOpenInterest) {
    throw new Error("An open interest already exists for this applicant pair");
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
  toRegistrationId: Id<"registrations">
) {
  if (fromRegistrationId === toRegistrationId) {
    throw new Error("Applicant cannot express interest in themselves");
  }

  const fromRegistration = await getRegistrationOrThrow(ctx, fromRegistrationId);
  const toRegistration = await getRegistrationOrThrow(ctx, toRegistrationId);
  const visibility = deriveVisibility(fromRegistration.gender, toRegistration.gender);

  assertProfileCompleted(fromRegistration, "Requester");
  assertProfileCompleted(toRegistration, "Recipient");
  await assertOpenInterestCap(ctx, fromRegistrationId);
  await assertNoDuplicateOpenInterest(ctx, fromRegistrationId, toRegistrationId);

  return {
    fromRegistration,
    toRegistration,
    visibility,
    initialStatus: fromRegistration.activeMatchId || toRegistration.activeMatchId ? "queued" as const : "new" as const,
  };
}

async function findReciprocalOpenInterest(
  ctx: ReadCtx,
  fromRegistrationId: Id<"registrations">,
  toRegistrationId: Id<"registrations">
) {
  const reciprocalInterests = await ctx.db
    .query("interests")
    .withIndex("by_fromRegistrationId_and_toRegistrationId", (q) =>
      q.eq("fromRegistrationId", fromRegistrationId).eq("toRegistrationId", toRegistrationId)
    )
    .take(20);

  return reciprocalInterests.find((interest) => openInterestStatusSet.has(interest.status)) ?? null;
}

export async function createMatchFromInterest(
  ctx: MutationCtx,
  interest: Doc<"interests">,
  adminNotes?: string
) {
  if (interest.matchId) {
    throw new Error("Interest already linked to a match");
  }

  const fromRegistration = await getRegistrationOrThrow(ctx, interest.fromRegistrationId);
  const toRegistration = await getRegistrationOrThrow(ctx, interest.toRegistrationId);
  deriveVisibility(fromRegistration.gender, toRegistration.gender);

  const maleRegistrationId =
    fromRegistration.gender === "male" ? interest.fromRegistrationId : interest.toRegistrationId;
  const femaleRegistrationId =
    fromRegistration.gender === "female" ? interest.fromRegistrationId : interest.toRegistrationId;
  const now = Date.now();

  const matchId = await ctx.db.insert("matches", {
    maleRegistrationId,
    femaleRegistrationId,
    interestType: deriveInterestType(fromRegistration.gender),
    status: "new",
    adminNotes: adminNotes ?? interest.notes,
    interestId: interest._id,
    initiatedBy: "interest_signal",
    createdAt: now,
    updatedAt: now,
  });

  await ctx.db.patch(interest._id, {
    matchId,
    status: "converted_to_match",
    adminStatus: "matched",
    updatedAt: now,
  });

  return matchId;
}

async function createMutualInterestMatch(
  ctx: MutationCtx,
  interest: Doc<"interests">,
  reciprocalInterest: Doc<"interests">
) {
  const fromRegistration = await getRegistrationOrThrow(ctx, interest.fromRegistrationId);
  const toRegistration = await getRegistrationOrThrow(ctx, interest.toRegistrationId);
  deriveVisibility(fromRegistration.gender, toRegistration.gender);

  const maleRegistrationId =
    fromRegistration.gender === "male" ? interest.fromRegistrationId : interest.toRegistrationId;
  const femaleRegistrationId =
    fromRegistration.gender === "female" ? interest.fromRegistrationId : interest.toRegistrationId;
  const now = Date.now();
  const notes = [interest.notes, reciprocalInterest.notes].filter(Boolean).join("\n\n") || undefined;

  const matchId = await ctx.db.insert("matches", {
    maleRegistrationId,
    femaleRegistrationId,
    interestType: "mutual_interest",
    status: "new",
    adminNotes: notes,
    interestId: interest._id,
    initiatedBy: "interest_signal",
    createdAt: now,
    updatedAt: now,
  });

  for (const matchedInterest of [interest, reciprocalInterest]) {
    await ctx.db.patch(matchedInterest._id, {
      matchId,
      status: "converted_to_match",
      adminStatus: "matched",
      updatedAt: now,
    });
  }

  return matchId;
}

export async function createInterestWithRules(
  ctx: MutationCtx,
  args: {
    fromRegistrationId: Id<"registrations">;
    toRegistrationId: Id<"registrations">;
    rank?: number;
    source: InterestSource;
    notes?: string;
  }
) {
  const { visibility, initialStatus } = await assertCanCreateInterest(
    ctx,
    args.fromRegistrationId,
    args.toRegistrationId
  );
  const now = Date.now();
  const interestId = await ctx.db.insert("interests", {
    fromRegistrationId: args.fromRegistrationId,
    toRegistrationId: args.toRegistrationId,
    rank: args.rank,
    source: args.source,
    status: initialStatus,
    visibility,
    adminStatus: "pending",
    notes: args.notes,
    createdAt: now,
    updatedAt: now,
  });

  const interest = await ctx.db.get(interestId);
  if (!interest) {
    throw new Error("Interest not found after creation");
  }

  if (initialStatus === "queued") {
    return { interestId, matchId: null };
  }

  const reciprocalInterest = await findReciprocalOpenInterest(
    ctx,
    args.toRegistrationId,
    args.fromRegistrationId
  );
  if (!reciprocalInterest || reciprocalInterest.status === "queued") {
    return { interestId, matchId: null };
  }

  const matchId = await createMutualInterestMatch(ctx, interest, reciprocalInterest);
  return { interestId, matchId };
}

export async function activateInterestAndQueueCompetitors(
  ctx: MutationCtx,
  interestId: Id<"interests">
) {
  const interest = await ctx.db.get(interestId);
  if (!interest) {
    throw new Error("Interest not found");
  }

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
  const [oldestQueued] = await getQueuedInterestsForRegistration(ctx, registrationId);
  if (!oldestQueued) return null;
  await activateInterestAndQueueCompetitors(ctx, oldestQueued._id);
  return oldestQueued._id;
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
