import { currentAge } from "./birthdays";
import { canReceiveEventMessages } from "./eventMessagingEligibility";
import { recordPairApproval, contactsVisible, linkedFlows, assertMatchInterest } from "./contactGate";
import { sessionAllowed } from "./capabilitySecurity";
import { requireAdmin } from "./adminAuthorization";
import { matchesInterestFirstName } from "./interestIdentity";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  findEligibleInterestSubmissionEvent,
} from "./eventRules";
import {
  createApplicantInterestWithRules,
  promoteOldestQueuedForRegistration,
} from "./interestRules";
import { buildRegistrationNumberMaps } from "./registrationNumbers";

const KEEP_OPEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type ReadCtx = QueryCtx | MutationCtx;
type Registration = Doc<"registrations">;
type Interest = Doc<"interests">;
type InterestFlow = Doc<"interestFlows">;

async function getRegistrationForSession(ctx: ReadCtx, sessionHash: string) {
  const session = await ctx.db
    .query("applicantSessions")
    .withIndex("by_sessionHash", (q) => q.eq("sessionHash", sessionHash))
    .unique();

  if (!session || !(await sessionAllowed(ctx, session))) {
    throw new Error("Unauthorized");
  }

  const registration = await ctx.db.get(session.registrationId);
  if (!registration) {
    throw new Error("Unauthorized");
  }

  return registration;
}

function requireApprovedForInterestAction(registration: Registration) {
  if (registration.status !== "approved") {
    throw new Error("Your registration must be approved before you can express or respond to interests.");
  }
}

function requirePendingOrApprovedForInterestSubmission(registration: Registration) {
  if (!["pending", "approved"].includes(registration.status)) {
    throw new Error("Your registration must be pending or approved before you can express interest.");
  }
}

async function getRegistrationNumberMap(ctx: ReadCtx) {
  const registrations = await ctx.db.query("registrations").take(1000);
  return buildRegistrationNumberMaps(registrations);
}

function initialFlowStatusForInterest(interest: Interest) {
  if (interest.status === "declined") return "declined" as const;
  if (interest.status === "closed" || interest.status === "withdrawn") return "closed" as const;
  if (interest.status === "converted_to_match") return "bio_review" as const;
  return interest.visibility === "internal_only" ? "private_documented" as const : "awaiting_inbound_response" as const;
}

async function appendEvent(
  ctx: MutationCtx,
  flow: InterestFlow,
  eventType: string,
  actorRegistrationId?: Id<"registrations">,
  message?: string
) {
  await ctx.db.insert("interestFlowEvents", {
    interestFlowId: flow._id,
    interestId: flow.interestId,
    actor: actorRegistrationId ? "applicant" : "system",
    actorRegistrationId,
    eventType,
    message,
    createdAt: Date.now(),
  });
}

async function getFlowByInterestId(ctx: ReadCtx, interestId: Id<"interests">) {
  return await ctx.db
    .query("interestFlows")
    .withIndex("by_interestId", (q) => q.eq("interestId", interestId))
    .unique();
}

async function ensureFlow(ctx: MutationCtx, interest: Interest) {
  const existing = await getFlowByInterestId(ctx, interest._id);
  if (existing) return existing;

  const now = Date.now();
  const flowId = await ctx.db.insert("interestFlows", {
    interestId: interest._id,
    fromRegistrationId: interest.fromRegistrationId,
    toRegistrationId: interest.toRegistrationId,
    flowStatus: initialFlowStatusForInterest(interest),
    recipientDecision: interest.visibility === "internal_only" ? "pending" : "pending",
    requesterFinalApproval: "pending",
    recipientFinalApproval: "pending",
    photoDecision: "pending",
    bioVisibleAt: interest.status === "converted_to_match" ? now : undefined,
    createdAt: now,
    updatedAt: now,
  });

  const flow = await ctx.db.get(flowId);
  if (!flow) throw new Error("Interest flow not found after creation");
  await appendEvent(ctx, flow, "flow_created");
  return flow;
}

async function ensureFlowForQuery(ctx: ReadCtx, interest: Interest) {
  return await getFlowByInterestId(ctx, interest._id);
}

function canSeeCounterpartyProfile(
  viewer: Registration,
  flow: InterestFlow | null,
  direction: "inbound" | "outbound" | "private"
) {
  if (flow?.contactSharedAt) return true;
  if (direction === "outbound" || direction === "private") return true;
  return viewer.gender === "female";
}

async function safeCounterparty(
  ctx: ReadCtx,
  viewer: Registration,
  counterparty: Registration | null,
  counterpartyNumber: number | undefined,
  flow: InterestFlow | null,
  direction: "inbound" | "outbound" | "private",
  interest: Interest
)
 {
  if (!counterparty) return null;
  const showProfile = canSeeCounterpartyProfile(viewer, flow, direction);
  const showName = showProfile && !(viewer.gender === "male" && counterparty.gender === "female");
  const contactShared = await contactsVisible(ctx, interest, flow);
  const fullProfileVisible =
    showProfile &&
    (contactShared ||
      Boolean(flow?.bioVisibleAt) ||
      direction === "outbound" ||
      direction === "private" ||
      (direction === "inbound" && viewer.gender === "female"));
  // Neither gender nor contact sharing is photo consent.
  const explicitChoice = counterparty._id === interest.fromRegistrationId && viewer._id === interest.toRegistrationId
    ? interest.senderPhotoConsent : undefined;
  const imagesVisible = showProfile && isVisibleInApplicantDashboard(interest) &&
    !["closed", "declined"].includes(flow?.flowStatus ?? "") &&
    (explicitChoice !== undefined
      ? explicitChoice === "yes" && !interest.senderPhotoConsentRevokedAt
      : (counterparty.photoSharingPermission === "yes" ||
        (flow?.photoDecision === "approved" && flow.photoRequestedByRegistrationId === viewer._id)));
  const imageUrls = imagesVisible
    ? await Promise.all((counterparty.imageStorageIds || []).map((storageId) => ctx.storage.getUrl(storageId)))
    : [];

  return {
    registrationId: showProfile ? counterparty._id : null,
    applicantNumber: counterpartyNumber ?? null,
    ...(showName ? { name: counterparty.name } : {}),
    age: await currentAge(ctx, counterparty),
    gender: counterparty.gender,
    maritalStatus: fullProfileVisible ? counterparty.maritalStatus : null,
    education: fullProfileVisible ? counterparty.education : null,
    job: fullProfileVisible ? counterparty.job : null,
    ethnicity: fullProfileVisible ? counterparty.ethnicity ?? null : null,
    prayerCommitment: fullProfileVisible ? counterparty.prayerCommitment ?? null : null,
    hijabResponse: fullProfileVisible ? counterparty.hijabResponse ?? null : null,
    spouseRequirement1: fullProfileVisible ? counterparty.spouseRequirement1 ?? null : null,
    spouseRequirement2: fullProfileVisible ? counterparty.spouseRequirement2 ?? null : null,
    spouseRequirement3: fullProfileVisible ? counterparty.spouseRequirement3 ?? null : null,
    photoSharingPermission: fullProfileVisible ? counterparty.photoSharingPermission ?? null : null,
    imageUrls: imageUrls.filter((url): url is string => Boolean(url)),
    shareableBio: showProfile ? counterparty.shareableBio ?? null : null,
    email: contactShared ? counterparty.email : null,
    phone: contactShared ? counterparty.phone : null,
    label: showName ? counterparty.name : `Applicant #${counterpartyNumber ?? "-"}`,
    fullProfileVisible,
    viewerGender: viewer.gender,
  };
}

function flowStatus(flow: InterestFlow | null, interest: Interest) {
  return flow?.flowStatus ?? initialFlowStatusForInterest(interest);
}

function isVisibleInApplicantDashboard(interest: Interest) {
  return !["closed", "declined", "withdrawn"].includes(interest.status);
}

function dashboardDirection(viewer: Registration, interest: Interest) {
  if (interest.testReset || !isVisibleInApplicantDashboard(interest) || interest.fromRegistrationId === interest.toRegistrationId || (interest.femaleWorkflow && ["declined", "revoked"].includes(interest.femaleWorkflow.state))) return null;
  if (interest.fromRegistrationId === viewer._id) {
    if (viewer.gender === "female" && interest.visibility === "internal_only") return "private" as const;
    if (viewer.gender === "male" && interest.visibility !== "internal_only") return "outbound" as const;
  }
  if (interest.toRegistrationId === viewer._id && interest.visibility !== "internal_only") return "inbound" as const;
  return null;
}

async function serializeInterest(
  ctx: ReadCtx,
  viewer: Registration,
  interest: Interest,
  numberById: Map<Id<"registrations">, number>,
  direction: "inbound" | "outbound" | "private"
) {
  const flow = await ensureFlowForQuery(ctx, interest);
  const counterpartyId =
    direction === "inbound" ? interest.fromRegistrationId : interest.toRegistrationId;
  const counterparty = await ctx.db.get(counterpartyId);

  const internalStatus = flowStatus(flow, interest);
  const ownFinalApproval = (direction === "inbound" ? flow?.recipientFinalApproval : flow?.requesterFinalApproval) ?? "pending";
  const paused = interest.matchId ? (await ctx.db.get(interest.matchId))?.status === "paused" : false;
  const closed = ["closed", "declined", "withdrawn"].includes(interest.status) || ["closed", "declined"].includes(internalStatus);
  const canRespond = viewer.status === "approved" && !closed && !paused && !interest.femaleWorkflow && direction === "inbound" && interest.visibility !== "internal_only" && ["awaiting_inbound_response", "kept_open"].includes(internalStatus);
  const canFinalApprove = viewer.status === "approved" && !closed && !interest.femaleWorkflow && !paused && Boolean(flow?.bioVisibleAt) && ownFinalApproval === "pending" && !["contact_shared", "declined", "closed"].includes(internalStatus);
  return {
    interestId: interest._id,
    ...(interest.femaleWorkflow ? { femaleWorkflow: true } : {}),
    canPause: !closed && Boolean(interest.matchId),
    paused,
    direction,
    status: closed ? "closed" : internalStatus === "contact_shared" ? "contact_shared" : "in_progress",
    flowStatus: closed ? "closed" : internalStatus === "contact_shared" ? "contact_shared" : "in_progress",
    canRespond,
    canFinalApprove,
    canWithdraw: !interest.femaleWorkflow && (direction === "outbound" || direction === "private") && ["awaiting_inbound_response", "kept_open", "private_documented"].includes(internalStatus),
    ownFinalApproval,
    visibility: interest.visibility,
    createdAt: interest.createdAt,
    keepOpenExpiresAt: direction === "inbound" ? flow?.keepOpenExpiresAt ?? null : null,
    contactSharedAt: await contactsVisible(ctx, interest, flow) ? flow?.contactSharedAt ?? null : null,
    photoDecision: flow?.photoDecision ?? "pending",
    senderPhotoConsent: viewer._id === interest.fromRegistrationId ? interest.senderPhotoConsent ?? null : null,
    senderPhotoConsentRevokedAt: viewer._id === interest.fromRegistrationId ? interest.senderPhotoConsentRevokedAt ?? null : null,
    counterparty: await safeCounterparty(ctx, viewer, counterparty, counterparty ? numberById.get(counterparty._id) : undefined, flow, direction, interest),
  };
}

// Narrow read-only refresh: no profile serialization or unrelated applicant scans.
export const getInterestEligibility = query({
  args: { sessionHash: v.string() },
  handler: async (ctx, args) => {
    const registration = await getRegistrationForSession(ctx, args.sessionHash);
    const event = await findEligibleInterestSubmissionEvent(ctx, registration._id);
    const submissions = event ? await ctx.db.query("interests")
      .withIndex("by_submission_quota", q => q.eq("fromRegistrationId", registration._id).eq("eventId", event._id).eq("source", "platform_submission").eq("testReset", undefined)).take(3) : [];
    return {
      eventLogisticsRestricted: !canReceiveEventMessages(registration),
      interestSubmissionEventId: event?._id ?? null,
      interestSubmissions: submissions.map(row => ({ interestId: row._id, status: ["closed", "declined", "withdrawn"].includes(row.status) ? "closed" : "submitted" })),
      canSubmitInterest: Boolean(event) && ["pending", "approved"].includes(registration.status) && registration.profileCompletionStatus === "completed",
      interestSubmissionLimit: 3,
    };
  },
});

export const getDashboard = query({
  args: {
    sessionHash: v.string(),
    connectionId: v.optional(v.id("interests")),
  },
  handler: async (ctx, args) => {
    const registration = await getRegistrationForSession(ctx, args.sessionHash);
    const requested = args.connectionId ? await ctx.db.get(args.connectionId) : null;
    if (args.connectionId) {
      if (!requested || !dashboardDirection(registration, requested)) throw new Error("Connection unavailable");
      const flow = await ensureFlowForQuery(ctx, requested);
      if (flow && (flow.fromRegistrationId !== requested.fromRegistrationId || flow.toRegistrationId !== requested.toRegistrationId || ["closed", "declined"].includes(flow.flowStatus))) throw new Error("Connection unavailable");
      if (requested.matchId) {
        const match = await ctx.db.get(requested.matchId);
        if (!match || match.testResetAt !== undefined || ["closed", "declined"].includes(match.status)) throw new Error("Connection unavailable");
        try { assertMatchInterest(match, requested); await linkedFlows(ctx, requested); } catch { throw new Error("Connection unavailable"); }
      }
    }
    const { byId } = await getRegistrationNumberMap(ctx);
    const eligibleEvent = await findEligibleInterestSubmissionEvent(ctx, registration._id);
    const inboundRows = await ctx.db
      .query("interests")
      .withIndex("by_toRegistrationId_and_testReset", (q) => q.eq("toRegistrationId", registration._id).eq("testReset", undefined))
      .take(100);
    const outboundRows = await ctx.db
      .query("interests")
      .withIndex("by_fromRegistrationId_and_testReset", (q) => q.eq("fromRegistrationId", registration._id).eq("testReset", undefined))
      .take(100);

    if (requested) {
      const rows = requested.toRegistrationId === registration._id ? inboundRows : outboundRows;
      if (!rows.some(row => row._id === requested._id)) rows.push(requested);
    }
    const visibleInbound = inboundRows.filter(interest => dashboardDirection(registration, interest) === "inbound");
    const privateDocumented = outboundRows.filter(interest => dashboardDirection(registration, interest) === "private");
    const visibleOutbound = outboundRows.filter(interest => dashboardDirection(registration, interest) === "outbound");

    const submissions = eligibleEvent ? await ctx.db.query("interests")
      .withIndex("by_submission_quota", q => q.eq("fromRegistrationId", registration._id).eq("eventId", eligibleEvent._id).eq("source", "platform_submission").eq("testReset", undefined)).take(3) : [];
    return {
      eventLogisticsRestricted: !canReceiveEventMessages(registration),
      requestedConnectionId: args.connectionId ?? null,
      interestSubmissionEventId: eligibleEvent?._id ?? null,
      interestSubmissions: submissions.map(row => ({ interestId: row._id, status: ["closed", "declined", "withdrawn"].includes(row.status) ? "closed" : "submitted" })),
      applicant: {
        registrationId: registration._id,
        name: registration.name,
        status: registration.status,
        hasPhotos: Boolean(registration.imageStorageIds?.length),
        gender: registration.gender,
        applicantNumber: byId.get(registration._id) ?? null,
        profileCompletionStatus: registration.profileCompletionStatus ?? "not_started",
      },
      inbound: await Promise.all(
        visibleInbound.map((interest) => serializeInterest(ctx, registration, interest, byId, "inbound"))
      ),
      outbound: await Promise.all(
        visibleOutbound.map((interest) => serializeInterest(ctx, registration, interest, byId, "outbound"))
      ),
      // Closed rows carry only the viewer's own receipt, never restored profile access.
      history: await Promise.all([...inboundRows, ...outboundRows].filter(row => !row.testReset && !row.femaleWorkflow && !isVisibleInApplicantDashboard(row) && (row.fromRegistrationId === registration._id || row.visibility !== "internal_only")).map(async row => {
        const flow = await ensureFlowForQuery(ctx, row);
        return { interestId: row._id, status: "closed", ownDecision: row.fromRegistrationId === registration._id && row.status === "withdrawn" ? "withdrawn" : row.toRegistrationId === registration._id && flow?.recipientDecision === "declined" ? "declined" : (row.fromRegistrationId === registration._id ? flow?.requesterFinalApproval : flow?.recipientFinalApproval) ?? "pending" };
      })),
      privateDocumented: await Promise.all(
        privateDocumented.map((interest) => serializeInterest(ctx, registration, interest, byId, "private"))
      ),
      canSubmitInterest: Boolean(eligibleEvent) && ["pending", "approved"].includes(registration.status) && registration.profileCompletionStatus === "completed",
      interestSubmissionLimit: 3,
    };
  },
});

export const submitInterestNumber = mutation({
  args: {
    sessionHash: v.string(),
    applicantNumber: v.number(),
    applicantName: v.string(),
    expectedEventId: v.id("events"),
    // Compatibility only: an old client may still send a denial. It can never grant access.
    photoConsent: v.optional(v.union(v.literal("yes"), v.literal("no"))),
  },
  handler: async (ctx, args) => {
    const registration = await getRegistrationForSession(ctx, args.sessionHash);
    requirePendingOrApprovedForInterestSubmission(registration);
    const selected = await findEligibleInterestSubmissionEvent(ctx, registration._id);
    if (!selected || selected._id !== args.expectedEventId) {
      throw new Error("Interest submissions are unavailable or the selected event changed. You must be approved, confirmed, and checked in to the event that is ON.");
    }
    const target = Number.isSafeInteger(args.applicantNumber) && args.applicantNumber > 0
      ? await ctx.db.query("registrations").withIndex("by_publicApplicantNumber", q => q.eq("publicApplicantNumber", args.applicantNumber)).unique()
      : null;
    if (!target || !matchesInterestFirstName(target.name, args.applicantName) ||
        target._id === registration._id || target.gender === registration.gender || target.status !== "approved") {
      throw new Error("Applicant details could not be verified");
    }

    const previous = await ctx.db.query("interests")
      .withIndex("by_submission_quota", q => q.eq("fromRegistrationId", registration._id).eq("eventId", selected._id).eq("source", "platform_submission").eq("testReset", undefined)).take(3);
    const retry = previous.find(row => row.toRegistrationId === target._id);
    if (retry) {
      if (!isVisibleInApplicantDashboard(retry)) throw new Error("Interest already submitted for this event");
      return { interestId: retry._id, matchId: retry.matchId ?? null, private: retry.visibility === "internal_only", inboundInterestNotification: null };
    }

    const result = await createApplicantInterestWithRules(ctx, {
      fromRegistrationId: registration._id,
      toRegistrationId: target._id,
      source: "platform_submission",
      applicantName: args.applicantName,
      notes:
        registration.gender === "female"
          ? `Private interest documented by applicant number: ${args.applicantNumber}`
          : `Visible interest submitted by applicant number: ${args.applicantNumber}`,
    });

    const interest = await ctx.db.get(result.interestId);
    if (!interest) throw new Error("Interest not found after creation");
    // Snapshot only this newly created recipient grant. Never recompute historical choices
    // on retries or preference edits; revocation remains recipient-specific.
    await ctx.db.patch(interest._id, { senderPhotoConsent: registration.photoSharingPermission === "yes" && args.photoConsent !== "no" ? "yes" : "no", ...(registration.gender === "female" ? { femaleWorkflow: { state: "private_documented" as const } } : {}) });
    const flow = await ensureFlow(ctx, interest);
    await appendEvent(ctx, flow, "interest_number_submitted", registration._id);

    const shouldNotifyInboundRecipient =
      registration.gender === "male" &&
      target.gender === "female" &&
      interest.visibility === "admin_actionable" &&
      !interest.inboundInterestNotificationSentAt;
    if (shouldNotifyInboundRecipient) {
      await ctx.db.patch(interest._id, {
        inboundInterestNotificationSentAt: Date.now(),
        inboundInterestNotificationError: undefined,
        updatedAt: Date.now(),
      });
    }

    return {
      interestId: result.interestId,
      matchId: result.matchId,
      private: interest.visibility === "internal_only",
      inboundInterestNotification: shouldNotifyInboundRecipient
        ? { interestId: interest._id }
        : null,
    };
  },
});

export const recordInboundInterestNotificationFailure = mutation({
  args: { adminSecret: v.optional(v.string()),
    interestId: v.id("interests"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    const interest = await ctx.db.get(args.interestId);
    if (!interest || interest.testReset) {
      throw new Error("Interest not found");
    }

    await ctx.db.patch(interest._id, {
      inboundInterestNotificationSentAt: undefined,
      inboundInterestNotificationError: args.error,
      updatedAt: Date.now(),
    });

    return interest._id;
  },
});

export const respondToInbound = mutation({
  args: {
    sessionHash: v.string(),
    interestId: v.id("interests"),
    decision: v.union(v.literal("accept"), v.literal("decline"), v.literal("keep_open")),
  },
  handler: async (ctx, args) => {
    const registration = await getRegistrationForSession(ctx, args.sessionHash);
    requireApprovedForInterestAction(registration);
    const interest = await ctx.db.get(args.interestId);
    if (!interest || interest.testReset) throw new Error("Interest not found");
    if (interest.femaleWorkflow || (!interest.matchId && interest.source === "platform_submission" && interest.visibility === "internal_only")) throw new Error("Use female website workflow");
    if (interest.toRegistrationId !== registration._id || interest.visibility === "internal_only") {
      throw new Error("Interest is not available for this applicant");
    }

    const flow = await ensureFlow(ctx, interest);
    if (["closed", "declined", "withdrawn"].includes(interest.status) || ["closed", "declined"].includes(flow.flowStatus)) throw new Error("Interest is no longer active");
    if (interest.matchId) {
      if (args.decision !== "accept") throw new Error("Close or pause the official connection instead");
      return flow._id;
    }
    const now = Date.now();

    if (args.decision === "decline") {
      await ctx.db.patch(interest._id, {
        status: "declined",
        adminStatus: "declined",
        updatedAt: now,
      });
      await ctx.db.patch(flow._id, {
        flowStatus: "declined",
        recipientDecision: "declined",
        closedReason: "recipient_declined",
        updatedAt: now,
      });
      await appendEvent(ctx, flow, "inbound_declined", registration._id);
      return flow._id;
    }

    if (args.decision === "keep_open") {
      await ctx.db.patch(interest._id, {
        status: "deferred",
        updatedAt: now,
      });
      await ctx.db.patch(flow._id, {
        flowStatus: "kept_open",
        recipientDecision: "kept_open",
        keepOpenExpiresAt: now + KEEP_OPEN_TTL_MS,
        updatedAt: now,
      });
      await appendEvent(ctx, flow, "inbound_kept_open", registration._id);
      return flow._id;
    }

    await ctx.db.patch(interest._id, {
      status: "active",
      adminStatus: "requested",
      updatedAt: now,
    });
    await ctx.db.patch(flow._id, {
      flowStatus: "bio_review",
      recipientDecision: "accepted",
      bioVisibleAt: now,
      updatedAt: now,
    });
    await appendEvent(ctx, flow, "inbound_accepted", registration._id);
    return flow._id;
  },
});

export const withdrawOutbound = mutation({
  args: {
    sessionHash: v.string(),
    interestId: v.id("interests"),
  },
  handler: async (ctx, args) => {
    const registration = await getRegistrationForSession(ctx, args.sessionHash);
    requireApprovedForInterestAction(registration);
    const interest = await ctx.db.get(args.interestId);
    if (!interest || interest.testReset) throw new Error("Interest not found");
    if (interest.fromRegistrationId !== registration._id) {
      throw new Error("Interest does not belong to this applicant");
    }
    if (!["new", "queued", "active", "deferred"].includes(interest.status)) {
      throw new Error("This interest can no longer be withdrawn");
    }

    const flow = await getFlowByInterestId(ctx, interest._id);
    const withdrawableFlowStatuses = new Set(["private_documented", "awaiting_inbound_response", "kept_open"] as const);
    if (flow && !withdrawableFlowStatuses.has(flow.flowStatus as "private_documented" | "awaiting_inbound_response" | "kept_open")) {
      throw new Error("This interest can no longer be withdrawn");
    }

    const now = Date.now();
    await ctx.db.patch(interest._id, {
      status: "withdrawn",
      adminStatus: interest.adminStatus === "matched" ? interest.adminStatus : "declined",
      updatedAt: now,
    });
    if (flow) {
      await ctx.db.patch(flow._id, {
        flowStatus: "closed",
        closedReason: "requester_withdrew",
        updatedAt: now,
      });
      await appendEvent(ctx, flow, "outbound_withdrawn", registration._id);
    }

    return interest._id;
  },
});

export const closeConnection = mutation({
  args: {
    sessionHash: v.string(),
    interestId: v.id("interests"),
  },
  handler: async (ctx, args) => {
    const registration = await getRegistrationForSession(ctx, args.sessionHash);
    requireApprovedForInterestAction(registration);
    const interest = await ctx.db.get(args.interestId);
    if (!interest || interest.testReset) throw new Error("Interest not found");
    if (interest.fromRegistrationId !== registration._id && interest.toRegistrationId !== registration._id) {
      throw new Error("Interest is not available for this applicant");
    }

    const flow = await ensureFlow(ctx, interest);
    const match = interest.matchId ? await ctx.db.get(interest.matchId) : null;
    const connectionIsOpen = flow.flowStatus === "contact_shared" || Boolean(flow.contactSharedAt) || match?.status === "contact_shared";
    if (!connectionIsOpen) {
      throw new Error("Contact information has not been shared for this connection");
    }

    const now = Date.now();
    const linked = match ? await ctx.db.query("interests").withIndex("by_matchId", q => q.eq("matchId", match._id)).collect() : [interest];
    if (match) await linkedFlows(ctx, interest);
    for (const row of linked) {
      await ctx.db.patch(row._id, { status: "closed", updatedAt: now });
      const linkedFlow = await getFlowByInterestId(ctx, row._id);
      if (linkedFlow) {
        await ctx.db.patch(linkedFlow._id, { flowStatus: "closed", closedReason: "applicant_closed_connection", updatedAt: now });
        await appendEvent(ctx, linkedFlow, "connection_closed", registration._id);
      }
    }
    if (match) {
      await ctx.db.patch(match._id, { status: "closed", closedReason: "applicant_closed_connection", updatedAt: now });
      for (const id of [match.maleRegistrationId, match.femaleRegistrationId]) {
        const person = await ctx.db.get(id);
        if (person?.activeMatchId === match._id) await ctx.db.patch(id, { activeMatchId: undefined });
        await promoteOldestQueuedForRegistration(ctx, id);
      }
    }

    return {
      interestId: interest._id,
      matchId: match?._id ?? null,
    };
  },
});

export const giveFinalApproval = mutation({
  args: {
    sessionHash: v.string(),
    interestId: v.id("interests"),
    approved: v.boolean(),
    adminSecret: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const serverDelivery = args.adminSecret !== undefined;
    if (serverDelivery) requireAdmin(args.adminSecret);
    const registration = await getRegistrationForSession(ctx, args.sessionHash);
    requireApprovedForInterestAction(registration);
    const interest = await ctx.db.get(args.interestId);
    if (!interest || interest.testReset) throw new Error("Interest not found");
    if (interest.femaleWorkflow || (!interest.matchId && interest.source === "platform_submission" && interest.visibility === "internal_only")) throw new Error("Use female website workflow");
    if (interest.fromRegistrationId !== registration._id && interest.toRegistrationId !== registration._id) {
      throw new Error("Interest is not available for this applicant");
    }

    const flow = await ensureFlow(ctx, interest);
    // Already-disclosed historical rows are immutable consent history.
    if (flow.contactSharedAt) {
      if (!args.approved) throw new Error("Final approval has already been recorded for this interest");
      return { flowId: serverDelivery ? flow._id : null, matchId: serverDelivery ? interest.matchId ?? null : null, finalApprovalNotification: null, contactSharedNotification: null, alreadyRecorded: true };
    }

    if (["closed", "declined", "withdrawn"].includes(interest.status) || ["closed", "declined"].includes(flow.flowStatus)) {
      throw new Error("Interest is no longer active");
    }
    if (!flow.bioVisibleAt) {
      throw new Error("Bio review is not open for this interest");
    }

    const now = Date.now();
    const viewerIsRequester = interest.fromRegistrationId === registration._id;
    const existingViewerFinalApproval = viewerIsRequester ? flow.requesterFinalApproval : flow.recipientFinalApproval;
    const requestedFinalApproval = args.approved ? "approved" as const : "declined" as const;
    if (existingViewerFinalApproval !== "pending") {
      if (existingViewerFinalApproval === requestedFinalApproval) {
        const matchId = args.approved ? await recordPairApproval(ctx, interest, registration._id, true) : interest.matchId;
        return {
          flowId: serverDelivery ? flow._id : null,
          matchId: serverDelivery ? matchId ?? null : null,
          finalApprovalNotification: null,
          alreadyRecorded: true,
        };
      }
      throw new Error("Final approval has already been recorded for this interest");
    }

    const matchId = await recordPairApproval(ctx, interest, registration._id, args.approved);
    const updatedFlow = (await ctx.db.get(flow._id))!;
    const shouldNotify = args.approved && !matchId && !updatedFlow.finalApprovalNotificationSentAt;
    if (shouldNotify) await ctx.db.patch(flow._id, { finalApprovalNotificationSentAt: now, finalApprovalNotificationError: undefined });
    return { flowId: serverDelivery ? flow._id : null, matchId: serverDelivery ? matchId : null, finalApprovalNotification: serverDelivery && shouldNotify ? { interestId: interest._id } : null, contactSharedNotification: null, alreadyRecorded: false };
  },
});

export const recordFinalApprovalNotificationFailure = mutation({
  args: { adminSecret: v.optional(v.string()),
    interestId: v.id("interests"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    if ((await ctx.db.get(args.interestId))?.testReset) throw new Error("Reset test interest is read-only");
    const flow = await getFlowByInterestId(ctx, args.interestId);
    if (!flow) {
      throw new Error("Interest flow not found");
    }

    await ctx.db.patch(flow._id, {
      finalApprovalNotificationSentAt: undefined,
      finalApprovalNotificationError: args.error,
      updatedAt: Date.now(),
    });

    return flow._id;
  },
});

export const revokeSenderPhotoConsent = mutation({
  args: { sessionHash: v.string(), interestId: v.id("interests") },
  handler: async (ctx, args) => {
    const owner = await getRegistrationForSession(ctx, args.sessionHash);
    const interest = await ctx.db.get(args.interestId);
    if (!interest || interest.testReset || interest.fromRegistrationId !== owner._id) throw new Error("Unauthorized");
    if (interest.senderPhotoConsent === undefined) throw new Error("No submission photo choice exists");
    if (!interest.senderPhotoConsentRevokedAt) await ctx.db.patch(interest._id, { senderPhotoConsentRevokedAt: Date.now() });
    return null;
  },
});

export const getNotificationRecipient = query({
  args: { adminSecret: v.optional(v.string()), sessionHash: v.string(), interestId: v.id("interests"), kind: v.union(v.literal("inbound"), v.literal("final_approval")) },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    const person = await getRegistrationForSession(ctx, args.sessionHash);
    const interest = await ctx.db.get(args.interestId);
    if (!interest || interest.testReset || ["closed", "declined", "withdrawn"].includes(interest.status)) throw new Error("Interest unavailable");
    if (![interest.fromRegistrationId, interest.toRegistrationId].includes(person._id)) throw new Error("Unauthorized");
    if (args.kind === "inbound" && (person._id !== interest.fromRegistrationId || interest.visibility === "internal_only")) throw new Error("Unauthorized");
    const id = args.kind === "inbound" || person._id === interest.fromRegistrationId ? interest.toRegistrationId : interest.fromRegistrationId;
    const recipient = await ctx.db.get(id);
    if (!recipient) throw new Error("Applicant unavailable");
    return { interestId: interest._id, name: recipient.name, email: recipient.email };
  },
});
