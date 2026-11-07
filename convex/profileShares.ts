import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

async function available(ctx: QueryCtx, share: Doc<"profileShares">) {
  if (share.revokedAt !== undefined || share.status === "closed") return false;
  if (share.interestId) {
    const interest = await ctx.db.get(share.interestId);
    if (!interest || interest.testReset) return false;
  }
  if (share.matchId) {
    const match = await ctx.db.get(share.matchId);
    if (!match || match.testResetAt !== undefined || match.status === "closed") return false;
  }
  return true;
}

import { assertProfileCompleted, getRegistrationOrThrow } from "./interestRules";

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    const candidates = await ctx.db.query("profileShares").take(1000);
    const shares = [];
    for (const share of candidates) if (await available(ctx, share)) shares.push(share);

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
    if (args.interestId) {
      const interest = await ctx.db.get(args.interestId);
      if (!interest || interest.testReset) throw new Error("Interest is unavailable for sharing");
    }
    if (args.matchId) {
      const match = await ctx.db.get(args.matchId);
      if (!match || match.testResetAt !== undefined || match.status === "closed") throw new Error("Match is unavailable for sharing");
    }
    const ownerRegistration = await getRegistrationOrThrow(ctx, args.ownerRegistrationId);
    assertProfileCompleted(ownerRegistration, "Profile owner");
    if (args.includeImages && ownerRegistration.photoSharingPermission !== "yes") {
      throw new Error("Photo sharing requires explicit owner consent");
    }

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

    if (!share || !(await available(ctx, share))) return null;

    const owner = await ctx.db.get(share.ownerRegistrationId);
    const recipient = await ctx.db.get(share.recipientRegistrationId);

    return {
      ...share,
      includeImages: share.includeImages && owner?.photoSharingPermission === "yes",
      owner: owner ? { ...owner, imageStorageIds: share.includeImages && owner.photoSharingPermission === "yes" ? owner.imageStorageIds : [] } : null,
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

    if (!share || !(await available(ctx, share))) {
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
