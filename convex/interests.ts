import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  activateInterestAndQueueCompetitors,
  createInterestWithRules,
  createMatchFromInterest,
} from "./interestRules";

const interestSource = v.union(
  v.literal("admin_entered"),
  v.literal("email"),
  v.literal("whatsapp"),
  v.literal("platform_submission")
);
const interestStatus = v.union(
  v.literal("new"),
  v.literal("queued"),
  v.literal("active"),
  v.literal("converted_to_match"),
  v.literal("deferred"),
  v.literal("withdrawn"),
  v.literal("declined"),
  v.literal("closed")
);
const interestAdminStatus = v.union(
  v.literal("pending"),
  v.literal("requested"),
  v.literal("declined"),
  v.literal("matched")
);

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    const interests = await ctx.db.query("interests").collect();

    return await Promise.all(
      interests.map(async (interest) => {
        const fromRegistration = await ctx.db.get(interest.fromRegistrationId);
        const toRegistration = await ctx.db.get(interest.toRegistrationId);
        const match = interest.matchId ? await ctx.db.get(interest.matchId) : null;

        return {
          ...interest,
          fromRegistration,
          toRegistration,
          match,
        };
      })
    );
  },
});

export const create = mutation({
  args: {
    fromRegistrationId: v.id("registrations"),
    toRegistrationId: v.id("registrations"),
    rank: v.optional(v.number()),
    source: interestSource,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const result = await createInterestWithRules(ctx, args);
    return result.interestId;
  },
});

export const updateAdminStatus = mutation({
  args: {
    id: v.id("interests"),
    adminStatus: interestAdminStatus,
  },
  handler: async (ctx, args) => {
    const interest = await ctx.db.get(args.id);
    if (!interest) {
      throw new Error("Interest not found");
    }

    await ctx.db.patch(args.id, {
      adminStatus: args.adminStatus,
      status: args.adminStatus === "declined" ? "declined" : interest.status,
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

export const claimDeclineNotification = mutation({
  args: {
    id: v.id("interests"),
  },
  handler: async (ctx, args) => {
    const interest = await ctx.db.get(args.id);
    if (!interest) {
      throw new Error("Interest not found");
    }

    if (interest.status !== "declined" && interest.adminStatus !== "declined") {
      throw new Error("Interest must be declined before sending a close notification");
    }

    if (interest.declineNotificationSentAt) {
      return {
        claimed: false,
        alreadySent: true,
        interestId: args.id,
      };
    }

    const requester = await ctx.db.get(interest.fromRegistrationId);
    const target = await ctx.db.get(interest.toRegistrationId);
    if (!requester || !target) {
      throw new Error("Interest registration not found");
    }

    const registrations = await ctx.db.query("registrations").take(1000);
    const sortedRegistrations = [...registrations].sort((a, b) => a._creationTime - b._creationTime);
    const targetIndex = sortedRegistrations.findIndex((registration) => registration._id === target._id);
    const targetNumber = targetIndex >= 0 ? targetIndex + 1 : null;

    await ctx.db.patch(args.id, {
      declineNotificationSentAt: Date.now(),
      declineNotificationError: undefined,
      updatedAt: Date.now(),
    });

    return {
      claimed: true,
      alreadySent: false,
      interestId: args.id,
      requesterEmail: requester.email,
      requesterName: requester.name,
      targetNumber,
    };
  },
});

export const recordDeclineNotificationFailure = mutation({
  args: {
    id: v.id("interests"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const interest = await ctx.db.get(args.id);
    if (!interest) {
      throw new Error("Interest not found");
    }

    await ctx.db.patch(args.id, {
      declineNotificationSentAt: undefined,
      declineNotificationError: args.error,
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

export const updateNotes = mutation({
  args: {
    id: v.id("interests"),
    notes: v.string(),
  },
  handler: async (ctx, args) => {
    const interest = await ctx.db.get(args.id);
    if (!interest) {
      throw new Error("Interest not found");
    }

    await ctx.db.patch(args.id, {
      notes: args.notes.trim() || undefined,
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("interests"),
    status: interestStatus,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const interest = await ctx.db.get(args.id);
    if (!interest) {
      throw new Error("Interest not found");
    }

    await ctx.db.patch(args.id, {
      status: args.status,
      adminStatus: args.status === "declined" ? "declined" : interest.adminStatus,
      notes: args.notes ?? interest.notes,
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

export const updateRank = mutation({
  args: {
    id: v.id("interests"),
    rank: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const interest = await ctx.db.get(args.id);
    if (!interest) {
      throw new Error("Interest not found");
    }

    await ctx.db.patch(args.id, {
      rank: args.rank,
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

export const remove = mutation({
  args: {
    id: v.id("interests"),
  },
  handler: async (ctx, args) => {
    const interest = await ctx.db.get(args.id);
    if (!interest) {
      throw new Error("Interest not found");
    }

    if (interest.matchId) {
      throw new Error("Cannot delete an interest that is already linked to a match");
    }

    await ctx.db.delete(args.id);
    return args.id;
  },
});

export const progressFirst = mutation({
  args: {
    interestId: v.id("interests"),
  },
  handler: async (ctx, args) => {
    return await activateInterestAndQueueCompetitors(ctx, args.interestId);
  },
});

export const convertToMatch = mutation({
  args: {
    interestId: v.id("interests"),
    adminNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const interest = await ctx.db.get(args.interestId);
    if (!interest) {
      throw new Error("Interest not found");
    }

    return await createMatchFromInterest(ctx, interest, args.adminNotes);
  },
});

export const getByRegistration = query({
  args: {
    registrationId: v.id("registrations"),
  },
  handler: async (ctx, args) => {
    const outbound = await ctx.db
      .query("interests")
      .withIndex("by_fromRegistrationId", (q) => q.eq("fromRegistrationId", args.registrationId))
      .collect();
    const inbound = await ctx.db
      .query("interests")
      .withIndex("by_toRegistrationId", (q) => q.eq("toRegistrationId", args.registrationId))
      .collect();

    return {
      outbound,
      inbound,
    };
  },
});
