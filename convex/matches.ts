import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  demoteOpenInterestsInvolvingRegistration,
  promoteOldestQueuedForRegistration,
} from "./interestRules";

const matchStatus = v.union(
  v.literal("new"),
  v.literal("reviewing"),
  v.literal("contact_shared"),
  v.literal("declined"),
  v.literal("paused"),
  v.literal("closed")
);

const releasingStatuses = new Set(["closed", "declined", "paused"]);

export const getById = query({
  args: {
    id: v.id("matches"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    const matches = await ctx.db.query("matches").take(1000);

    return await Promise.all(
      matches.map(async (match) => {
        const maleRegistration = await ctx.db.get(match.maleRegistrationId);
        const femaleRegistration = await ctx.db.get(match.femaleRegistrationId);
        const interest = match.interestId ? await ctx.db.get(match.interestId) : null;

        return {
          ...match,
          maleRegistration,
          femaleRegistration,
          interest,
        };
      })
    );
  },
});

export const resetPair = mutation({
  args: {
    registrationAId: v.id("registrations"),
    registrationBId: v.id("registrations"),
  },
  handler: async (ctx, args) => {
    const registrations = await Promise.all([
      ctx.db.get(args.registrationAId),
      ctx.db.get(args.registrationBId),
    ]);

    if (!registrations[0] || !registrations[1]) {
      throw new Error("Registration not found");
    }

    const pairIds = new Set([args.registrationAId, args.registrationBId]);
    const now = Date.now();

    const outboundA = await ctx.db
      .query("interests")
      .withIndex("by_fromRegistrationId", (q) => q.eq("fromRegistrationId", args.registrationAId))
      .collect();
    const outboundB = await ctx.db
      .query("interests")
      .withIndex("by_fromRegistrationId", (q) => q.eq("fromRegistrationId", args.registrationBId))
      .collect();

    const interestsToReset = [...outboundA, ...outboundB].filter(
      (interest) => pairIds.has(interest.fromRegistrationId) && pairIds.has(interest.toRegistrationId)
    );

    for (const interest of interestsToReset) {
      await ctx.db.patch(interest._id, {
        status: "closed",
        matchId: undefined,
        updatedAt: now,
      });
    }

    const matchesByMaleA = await ctx.db
      .query("matches")
      .withIndex("by_maleRegistrationId", (q) => q.eq("maleRegistrationId", args.registrationAId))
      .collect();
    const matchesByMaleB = await ctx.db
      .query("matches")
      .withIndex("by_maleRegistrationId", (q) => q.eq("maleRegistrationId", args.registrationBId))
      .collect();
    const matchesByFemaleA = await ctx.db
      .query("matches")
      .withIndex("by_femaleRegistrationId", (q) => q.eq("femaleRegistrationId", args.registrationAId))
      .collect();
    const matchesByFemaleB = await ctx.db
      .query("matches")
      .withIndex("by_femaleRegistrationId", (q) => q.eq("femaleRegistrationId", args.registrationBId))
      .collect();

    const matchesToDelete = [...matchesByMaleA, ...matchesByMaleB, ...matchesByFemaleA, ...matchesByFemaleB].filter(
      (match, index, all) =>
        pairIds.has(match.maleRegistrationId) &&
        pairIds.has(match.femaleRegistrationId) &&
        all.findIndex((candidate) => candidate._id === match._id) === index
    );

    for (const match of matchesToDelete) {
      await ctx.db.delete(match._id);
    }

    await ctx.db.patch(args.registrationAId, {
      activeMatchId: undefined,
    });
    await ctx.db.patch(args.registrationBId, {
      activeMatchId: undefined,
    });
    await promoteOldestQueuedForRegistration(ctx, args.registrationAId);
    await promoteOldestQueuedForRegistration(ctx, args.registrationBId);

    return {
      clearedInterestIds: interestsToReset.map((interest) => interest._id),
      deletedMatchIds: matchesToDelete.map((match) => match._id),
    };
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("matches"),
    status: matchStatus,
    adminNotes: v.optional(v.string()),
    closedReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const match = await ctx.db.get(args.id);
    if (!match) {
      throw new Error("Match not found");
    }

    const previousStatus = match.status;
    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: args.status,
      adminNotes: args.adminNotes ?? match.adminNotes,
      closedReason: args.closedReason ?? match.closedReason,
      updatedAt: now,
    });

    if (args.status === "contact_shared" && previousStatus !== "contact_shared") {
      const maleRegistration = await ctx.db.get(match.maleRegistrationId);
      const femaleRegistration = await ctx.db.get(match.femaleRegistrationId);

      if (maleRegistration?.activeMatchId && maleRegistration.activeMatchId !== args.id) {
        throw new Error("Male registration already has an active match");
      }
      if (femaleRegistration?.activeMatchId && femaleRegistration.activeMatchId !== args.id) {
        throw new Error("Female registration already has an active match");
      }

      await ctx.db.patch(match.maleRegistrationId, {
        activeMatchId: args.id,
      });
      await ctx.db.patch(match.femaleRegistrationId, {
        activeMatchId: args.id,
      });
      await demoteOpenInterestsInvolvingRegistration(ctx, match.maleRegistrationId, args.id);
      await demoteOpenInterestsInvolvingRegistration(ctx, match.femaleRegistrationId, args.id);
    }

    if (previousStatus === "contact_shared" && releasingStatuses.has(args.status)) {
      const maleRegistration = await ctx.db.get(match.maleRegistrationId);
      const femaleRegistration = await ctx.db.get(match.femaleRegistrationId);

      if (maleRegistration?.activeMatchId === args.id) {
        await ctx.db.patch(match.maleRegistrationId, {
          activeMatchId: undefined,
        });
      }
      if (femaleRegistration?.activeMatchId === args.id) {
        await ctx.db.patch(match.femaleRegistrationId, {
          activeMatchId: undefined,
        });
      }

      await promoteOldestQueuedForRegistration(ctx, match.maleRegistrationId);
      await promoteOldestQueuedForRegistration(ctx, match.femaleRegistrationId);
    }

    return args.id;
  },
});

export const verifyActiveMatchInvariant = query({
  args: {},
  handler: async (ctx) => {
    const issues: Array<{
      kind: string;
      registrationId?: string;
      matchId?: string;
      message: string;
    }> = [];
    const registrations = await ctx.db.query("registrations").take(1000);
    const contactSharedMatches = await ctx.db
      .query("matches")
      .withIndex("by_status", (q) => q.eq("status", "contact_shared"))
      .take(1000);

    for (const registration of registrations) {
      if (!registration.activeMatchId) continue;
      const match = await ctx.db.get(registration.activeMatchId);
      if (!match) {
        issues.push({
          kind: "registration_points_to_missing_match",
          registrationId: registration._id,
          matchId: registration.activeMatchId,
          message: "Registration points to a missing active match",
        });
        continue;
      }
      if (match.status !== "contact_shared") {
        issues.push({
          kind: "registration_points_to_inactive_match",
          registrationId: registration._id,
          matchId: match._id,
          message: "Registration points to a match that is not contact_shared",
        });
      }
    }

    for (const match of contactSharedMatches) {
      const male = await ctx.db.get(match.maleRegistrationId);
      const female = await ctx.db.get(match.femaleRegistrationId);
      if (male?.activeMatchId !== match._id) {
        issues.push({
          kind: "contact_shared_missing_male_pointer",
          registrationId: match.maleRegistrationId,
          matchId: match._id,
          message: "Contact-shared match is missing the male registration pointer",
        });
      }
      if (female?.activeMatchId !== match._id) {
        issues.push({
          kind: "contact_shared_missing_female_pointer",
          registrationId: match.femaleRegistrationId,
          matchId: match._id,
          message: "Contact-shared match is missing the female registration pointer",
        });
      }
    }

    return {
      ok: issues.length === 0,
      issues,
    };
  },
});

export const markNotificationSent = mutation({
  args: {
    id: v.id("matches"),
    sent: v.boolean(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      matchNotificationSentAt: args.sent ? Date.now() : undefined,
      matchNotificationError: args.error,
      updatedAt: Date.now(),
    });

    return args.id;
  },
});
