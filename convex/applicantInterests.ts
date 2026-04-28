import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  createInterestWithRules,
  createMatchFromInterest,
  demoteOpenInterestsInvolvingRegistration,
} from "./interestRules";

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
  if (!registration || registration.status !== "approved") {
    throw new Error("Unauthorized");
  }

  return registration;
}

async function getRegistrationNumberMap(ctx: ReadCtx) {
  const registrations = await ctx.db.query("registrations").take(1000);
  const sorted = [...registrations].sort((a, b) => a._creationTime - b._creationTime);
  return {
    registrations: sorted,
    byId: new Map(sorted.map((registration, index) => [registration._id, index + 1] as const)),
    byNumber: new Map(sorted.map((registration, index) => [index + 1, registration] as const)),
  };
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

function canSeeCounterpartyIdentity(flow: InterestFlow | null) {
  return Boolean(flow?.bioVisibleAt || flow?.contactSharedAt);
}

function safeCounterparty(
  viewer: Registration,
  counterparty: Registration | null,
  counterpartyNumber: number | undefined,
  flow: InterestFlow | null
)
 {
  if (!counterparty) return null;
  const showIdentity = canSeeCounterpartyIdentity(flow);
  return {
    registrationId: showIdentity ? counterparty._id : null,
    applicantNumber: counterpartyNumber ?? null,
    name: showIdentity ? counterparty.name : null,
    age: counterparty.age,
    gender: counterparty.gender,
    shareableBio: flow?.bioVisibleAt ? counterparty.shareableBio ?? null : null,
    email: flow?.contactSharedAt ? counterparty.email : null,
    phone: flow?.contactSharedAt ? counterparty.phone : null,
    label: showIdentity ? counterparty.name : `Applicant #${counterpartyNumber ?? "-"}`,
    viewerGender: viewer.gender,
  };
}

function flowStatus(flow: InterestFlow | null, interest: Interest) {
  return flow?.flowStatus ?? initialFlowStatusForInterest(interest);
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
    counterparty: safeCounterparty(viewer, counterparty, counterparty ? numberById.get(counterparty._id) : undefined, flow),
  };
}

export const getDashboard = query({
  args: {
    sessionHash: v.string(),
  },
  handler: async (ctx, args) => {
    const registration = await getRegistrationForSession(ctx, args.sessionHash);
    const { byId } = await getRegistrationNumberMap(ctx);
    const inboundRows = await ctx.db
      .query("interests")
      .withIndex("by_toRegistrationId", (q) => q.eq("toRegistrationId", registration._id))
      .take(100);
    const outboundRows = await ctx.db
      .query("interests")
      .withIndex("by_fromRegistrationId", (q) => q.eq("fromRegistrationId", registration._id))
      .take(100);

    const visibleInbound = inboundRows.filter((interest) => interest.visibility !== "internal_only");
    const privateDocumented =
      registration.gender === "female"
        ? outboundRows.filter((interest) => interest.visibility === "internal_only")
        : [];
    const visibleOutbound =
      registration.gender === "male"
        ? outboundRows.filter((interest) => interest.visibility !== "internal_only")
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
    const { byNumber } = await getRegistrationNumberMap(ctx);
    const target = byNumber.get(args.applicantNumber);

    if (!target) throw new Error("Applicant number not found");
    if (target._id === registration._id) throw new Error("Applicant cannot express interest in themselves");
    if (target.gender === registration.gender) throw new Error("Interest must be between opposite-gender applicants");

    const result = await createInterestWithRules(ctx, {
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

    return {
      interestId: result.interestId,
      matchId: result.matchId,
      private: interest.visibility === "internal_only",
    };
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

export const giveFinalApproval = mutation({
  args: {
    sessionHash: v.string(),
    interestId: v.id("interests"),
    approved: v.boolean(),
  },
  handler: async (ctx, args) => {
    const registration = await getRegistrationForSession(ctx, args.sessionHash);
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
    const requesterFinalApproval =
      interest.fromRegistrationId === registration._id
        ? args.approved ? "approved" as const : "declined" as const
        : flow.requesterFinalApproval;
    const recipientFinalApproval =
      interest.toRegistrationId === registration._id
        ? args.approved ? "approved" as const : "declined" as const
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
      return flow._id;
    }

    const bothApproved = requesterFinalApproval === "approved" && recipientFinalApproval === "approved";
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

    await ctx.db.patch(flow._id, {
      flowStatus: bothApproved ? "contact_shared" : "awaiting_final_approvals",
      requesterFinalApproval,
      recipientFinalApproval,
      requesterFinalApprovalAt: interest.fromRegistrationId === registration._id ? now : flow.requesterFinalApprovalAt,
      recipientFinalApprovalAt: interest.toRegistrationId === registration._id ? now : flow.recipientFinalApprovalAt,
      contactSharedAt: bothApproved ? now : flow.contactSharedAt,
      updatedAt: now,
    });
    await appendEvent(ctx, flow, bothApproved ? "contact_shared" : "final_approval_given", registration._id);

    return flow._id;
  },
});

