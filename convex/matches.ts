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
