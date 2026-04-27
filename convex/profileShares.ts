import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { assertProfileCompleted, getRegistrationOrThrow } from "./interestRules";

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    const shares = await ctx.db.query("profileShares").take(1000);

    return await Promise.all(
      shares.map(async (share) => {
        const owner = await ctx.db.get(share.ownerRegistrationId);
        const recipient = await ctx.db.get(share.recipientRegistrationId);

        return {
          ...share,
          owner,
          recipient,
        };
      })
    );
  },
});

export const create = mutation({
  args: {
    ownerRegistrationId: v.id("registrations"),
    recipientRegistrationId: v.id("registrations"),
    includeImages: v.boolean(),
    shareToken: v.string(),
    interestId: v.optional(v.id("interests")),
    matchId: v.optional(v.id("matches")),
  },
  handler: async (ctx, args) => {
    const ownerRegistration = await getRegistrationOrThrow(ctx, args.ownerRegistrationId);
    assertProfileCompleted(ownerRegistration, "Profile owner");

    const now = Date.now();
    return await ctx.db.insert("profileShares", {
      ownerRegistrationId: args.ownerRegistrationId,
      recipientRegistrationId: args.recipientRegistrationId,
      includeImages: args.includeImages,
      status: "shared",
      shareToken: args.shareToken,
      interestId: args.interestId,
      matchId: args.matchId,
      sentAt: now,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const getByShareToken = query({
  args: {
    shareToken: v.string(),
  },
  handler: async (ctx, args) => {
    const share = await ctx.db
      .query("profileShares")
      .withIndex("by_shareToken", (q) => q.eq("shareToken", args.shareToken))
      .first();

    if (!share) return null;

    const owner = await ctx.db.get(share.ownerRegistrationId);
    const recipient = await ctx.db.get(share.recipientRegistrationId);

    return {
      ...share,
      owner,
      recipient,
    };
  },
});

export const markViewed = mutation({
  args: {
    shareToken: v.string(),
  },
  handler: async (ctx, args) => {
    const share = await ctx.db
      .query("profileShares")
      .withIndex("by_shareToken", (q) => q.eq("shareToken", args.shareToken))
      .first();

    if (!share) {
      throw new Error("Shared profile not found");
    }

    await ctx.db.patch(share._id, {
      status: share.status === "shared" ? "viewed" : share.status,
      viewedAt: share.viewedAt ?? Date.now(),
      updatedAt: Date.now(),
    });

    return share._id;
  },
});
