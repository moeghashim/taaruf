import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getById = query({
  args: {
    id: v.id("matches"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
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

    return {
      clearedInterestIds: interestsToReset.map((interest) => interest._id),
      deletedMatchIds: matchesToDelete.map((match) => match._id),
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
