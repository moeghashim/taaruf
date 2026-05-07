import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  listEligibleInterestTargets,
} from "./eventRules";
import {
  createApplicantInterestWithRules,
  createMatchFromInterest,
  demoteOpenInterestsInvolvingRegistration,
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

  if (!session || session.revokedAt || session.expiresAt <= Date.now()) {
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
  direction: "inbound" | "outbound" | "private"
)
 {
  if (!counterparty) return null;
  const showProfile = canSeeCounterpartyProfile(viewer, flow, direction);
  const contactShared = Boolean(flow?.contactSharedAt);
  const fullProfileVisible =
    showProfile &&
    (contactShared ||
      Boolean(flow?.bioVisibleAt) ||
      direction === "outbound" ||
      direction === "private" ||
      (direction === "inbound" && viewer.gender === "female"));
  const imagesVisible =
    showProfile &&
    (contactShared ||
      (direction === "private" && viewer.gender === "female") ||
      (direction === "inbound" && viewer.gender === "female"));
  const imageUrls = imagesVisible
    ? await Promise.all((counterparty.imageStorageIds || []).map((storageId) => ctx.storage.getUrl(storageId)))
    : [];

  return {
    registrationId: showProfile ? counterparty._id : null,
    applicantNumber: counterpartyNumber ?? null,
    name: showProfile ? counterparty.name : null,
    age: counterparty.age,
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
    label: showProfile ? counterparty.name : `Applicant #${counterpartyNumber ?? "-"}`,
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

  return {
    interestId: interest._id,
    direction,
    status: interest.status,
    flowStatus: flowStatus(flow, interest),
    visibility: interest.visibility,
    adminStatus: interest.adminStatus ?? "pending",
    createdAt: interest.createdAt,
    updatedAt: interest.updatedAt,
    keepOpenExpiresAt: flow?.keepOpenExpiresAt ?? null,
    bioVisibleAt: flow?.bioVisibleAt ?? null,
    contactSharedAt: flow?.contactSharedAt ?? null,
    requesterFinalApproval: flow?.requesterFinalApproval ?? "pending",
    recipientFinalApproval: flow?.recipientFinalApproval ?? "pending",
    photoDecision: flow?.photoDecision ?? "pending",
    counterparty: await safeCounterparty(ctx, viewer, counterparty, counterparty ? numberById.get(counterparty._id) : undefined, flow, direction),
  };
}

export const getDashboard = query({
  args: {
    sessionHash: v.string(),
  },
  handler: async (ctx, args) => {
    const registration = await getRegistrationForSession(ctx, args.sessionHash);
    const { byId } = await getRegistrationNumberMap(ctx);
    const eligibleTargetIds = await listEligibleInterestTargets(ctx, registration);
    const inboundRows = await ctx.db
      .query("interests")
      .withIndex("by_toRegistrationId", (q) => q.eq("toRegistrationId", registration._id))
      .take(100);
    const outboundRows = await ctx.db
      .query("interests")
      .withIndex("by_fromRegistrationId", (q) => q.eq("fromRegistrationId", registration._id))
      .take(100);

    const visibleInbound = inboundRows.filter(
      (interest) => interest.visibility !== "internal_only" && isVisibleInApplicantDashboard(interest)
    );
    const privateDocumented =
      registration.gender === "female"
        ? outboundRows.filter(
            (interest) => interest.visibility === "internal_only" && isVisibleInApplicantDashboard(interest)
          )
        : [];
    const visibleOutbound =
      registration.gender === "male"
        ? outboundRows.filter(
            (interest) => interest.visibility !== "internal_only" && isVisibleInApplicantDashboard(interest)
          )
        : [];

    return {
      applicant: {
        registrationId: registration._id,
        name: registration.name,
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
      privateDocumented: await Promise.all(
        privateDocumented.map((interest) => serializeInterest(ctx, registration, interest, byId, "private"))
      ),
      eligibleInterestTargets: await Promise.all(
        [...eligibleTargetIds].map(async (registrationId) => {
          const target = await ctx.db.get(registrationId);
          if (!target) return null;
          return {
            registrationId: target._id,
            applicantNumber: byId.get(target._id) ?? null,
            firstName: target.name.trim().split(/\s+/)[0] || target.name,
          };
        })
      ).then((rows) => rows.filter((row): row is NonNullable<typeof row> => Boolean(row))),
    };
  },
});

export const submitInterestNumber = mutation({
  args: {
    sessionHash: v.string(),
    applicantNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const registration = await getRegistrationForSession(ctx, args.sessionHash);
    requireApprovedForInterestAction(registration);
    const { byNumber } = await getRegistrationNumberMap(ctx);
    const target = byNumber.get(args.applicantNumber);

    if (!target) throw new Error("Applicant number not found");
    if (target._id === registration._id) throw new Error("Applicant cannot express interest in themselves");
    if (target.gender === registration.gender) throw new Error("Interest must be between opposite-gender applicants");

    const result = await createApplicantInterestWithRules(ctx, {
      fromRegistrationId: registration._id,
      toRegistrationId: target._id,
      source: "platform_submission",
      notes:
        registration.gender === "female"
          ? `Private interest documented by applicant number: ${args.applicantNumber}`
          : `Visible interest submitted by applicant number: ${args.applicantNumber}`,
    });

    const interest = await ctx.db.get(result.interestId);
    if (!interest) throw new Error("Interest not found after creation");
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
        ? {
            interestId: interest._id,
            name: target.name,
            email: target.email,
          }
        : null,
    };
  },
});

export const recordInboundInterestNotificationFailure = mutation({
  args: {
    interestId: v.id("interests"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const interest = await ctx.db.get(args.interestId);
    if (!interest) {
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
    if (!interest) throw new Error("Interest not found");
    if (interest.toRegistrationId !== registration._id || interest.visibility === "internal_only") {
      throw new Error("Interest is not available for this applicant");
    }

    const flow = await ensureFlow(ctx, interest);
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
    if (!interest) throw new Error("Interest not found");
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
    if (!interest) throw new Error("Interest not found");
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
    await ctx.db.patch(interest._id, {
      status: "closed",
      updatedAt: now,
    });
    await ctx.db.patch(flow._id, {
      flowStatus: "closed",
      closedReason: "applicant_closed_connection",
      updatedAt: now,
    });
    await appendEvent(ctx, flow, "connection_closed", registration._id);

    if (match) {
      await ctx.db.patch(match._id, {
        status: "closed",
        closedReason: "applicant_closed_connection",
        updatedAt: now,
      });

      const maleRegistration = await ctx.db.get(match.maleRegistrationId);
      const femaleRegistration = await ctx.db.get(match.femaleRegistrationId);

      if (maleRegistration?.activeMatchId === match._id) {
        await ctx.db.patch(match.maleRegistrationId, {
          activeMatchId: undefined,
        });
      }
      if (femaleRegistration?.activeMatchId === match._id) {
        await ctx.db.patch(match.femaleRegistrationId, {
          activeMatchId: undefined,
        });
      }

      await promoteOldestQueuedForRegistration(ctx, match.maleRegistrationId);
      await promoteOldestQueuedForRegistration(ctx, match.femaleRegistrationId);
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
  },
  handler: async (ctx, args) => {
    const registration = await getRegistrationForSession(ctx, args.sessionHash);
    requireApprovedForInterestAction(registration);
    const interest = await ctx.db.get(args.interestId);
    if (!interest) throw new Error("Interest not found");
    if (interest.fromRegistrationId !== registration._id && interest.toRegistrationId !== registration._id) {
      throw new Error("Interest is not available for this applicant");
    }

    const flow = await ensureFlow(ctx, interest);
    if (!flow.bioVisibleAt) {
      throw new Error("Bio review is not open for this interest");
    }

    const now = Date.now();
    const viewerIsRequester = interest.fromRegistrationId === registration._id;
    const existingViewerFinalApproval = viewerIsRequester ? flow.requesterFinalApproval : flow.recipientFinalApproval;
    const requestedFinalApproval = args.approved ? "approved" as const : "declined" as const;
    if (existingViewerFinalApproval !== "pending") {
      if (existingViewerFinalApproval === requestedFinalApproval) {
        return {
          flowId: flow._id,
          matchId: interest.matchId ?? null,
          finalApprovalNotification: null,
          alreadyRecorded: true,
        };
      }
      throw new Error("Final approval has already been recorded for this interest");
    }

    const requesterFinalApproval =
      viewerIsRequester
        ? requestedFinalApproval
        : flow.requesterFinalApproval;
    const recipientFinalApproval =
      interest.toRegistrationId === registration._id
        ? requestedFinalApproval
        : flow.recipientFinalApproval;

    if (!args.approved) {
      await ctx.db.patch(interest._id, {
        status: "declined",
        adminStatus: "declined",
        updatedAt: now,
      });
      await ctx.db.patch(flow._id, {
        flowStatus: "declined",
        requesterFinalApproval,
        recipientFinalApproval,
        requesterFinalApprovalAt: interest.fromRegistrationId === registration._id ? now : flow.requesterFinalApprovalAt,
        recipientFinalApprovalAt: interest.toRegistrationId === registration._id ? now : flow.recipientFinalApprovalAt,
        closedReason: "final_approval_declined",
        updatedAt: now,
      });
      await appendEvent(ctx, flow, "final_approval_declined", registration._id);
      return {
        flowId: flow._id,
        matchId: interest.matchId ?? null,
        finalApprovalNotification: null,
        alreadyRecorded: false,
      };
    }

    const bothApproved = requesterFinalApproval === "approved" && recipientFinalApproval === "approved";
    const shouldNotifyOtherApplicant =
      !bothApproved &&
      !flow.finalApprovalNotificationSentAt &&
      (viewerIsRequester ? flow.recipientFinalApproval : flow.requesterFinalApproval) === "pending";
    const notificationRecipientId = viewerIsRequester ? interest.toRegistrationId : interest.fromRegistrationId;
    const notificationRecipient = shouldNotifyOtherApplicant
      ? await ctx.db.get(notificationRecipientId)
      : null;
    let matchId = interest.matchId;
    if (bothApproved && !matchId) {
      matchId = await createMatchFromInterest(ctx, interest);
    }

    if (bothApproved && matchId) {
      const match = await ctx.db.get(matchId);
      if (match) {
        await ctx.db.patch(match._id, {
          status: "contact_shared",
          updatedAt: now,
        });
        await ctx.db.patch(match.maleRegistrationId, {
          activeMatchId: match._id,
        });
        await ctx.db.patch(match.femaleRegistrationId, {
          activeMatchId: match._id,
        });
        await demoteOpenInterestsInvolvingRegistration(ctx, match.maleRegistrationId, match._id);
        await demoteOpenInterestsInvolvingRegistration(ctx, match.femaleRegistrationId, match._id);
      }
    }

    const contactSharedMatch = bothApproved && matchId ? await ctx.db.get(matchId) : null;
    const contactSharedRecipientRows = contactSharedMatch && !contactSharedMatch.contactSharedNotificationSentAt
      ? await Promise.all([
          ctx.db.get(contactSharedMatch.maleRegistrationId),
          ctx.db.get(contactSharedMatch.femaleRegistrationId),
        ])
      : [];
    const contactSharedRecipients = contactSharedRecipientRows.flatMap((recipient) =>
      recipient
        ? [{
            registrationId: recipient._id,
            name: recipient.name,
            email: recipient.email,
          }]
        : []
    );

    await ctx.db.patch(flow._id, {
      flowStatus: bothApproved ? "contact_shared" : "awaiting_final_approvals",
      requesterFinalApproval,
      recipientFinalApproval,
      requesterFinalApprovalAt: interest.fromRegistrationId === registration._id ? now : flow.requesterFinalApprovalAt,
      recipientFinalApprovalAt: interest.toRegistrationId === registration._id ? now : flow.recipientFinalApprovalAt,
      contactSharedAt: bothApproved ? now : flow.contactSharedAt,
      finalApprovalNotificationSentAt: shouldNotifyOtherApplicant ? now : flow.finalApprovalNotificationSentAt,
      finalApprovalNotificationError: shouldNotifyOtherApplicant ? undefined : flow.finalApprovalNotificationError,
      updatedAt: now,
    });
    await appendEvent(ctx, flow, bothApproved ? "contact_shared" : "final_approval_given", registration._id);

    return {
      flowId: flow._id,
      matchId: matchId ?? null,
      finalApprovalNotification: notificationRecipient
        ? {
            registrationId: notificationRecipient._id,
            name: notificationRecipient.name,
            email: notificationRecipient.email,
          }
        : null,
      contactSharedNotification: contactSharedMatch
        ? {
            matchId: contactSharedMatch._id,
            recipients: contactSharedRecipients,
          }
        : null,
      alreadyRecorded: false,
    };
  },
});

export const recordFinalApprovalNotificationFailure = mutation({
  args: {
    interestId: v.id("interests"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
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
