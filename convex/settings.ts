import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  args: {
    key: v.string(),
  },
  handler: async (ctx, args) => {
    const setting = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();

    return setting?.value ?? null;
  },
});

export const set = mutation({
  args: {
    key: v.string(),
    value: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        value: args.value,
      });
      return existing._id;
    } else {
      return await ctx.db.insert("settings", {
        key: args.key,
        value: args.value,
      });
    }
  },
});

// Compatibility for older deployed bundles that still read registration slot caps.
// Event capacity is authoritative, so these caps are intentionally non-limiting.
export const getSlotLimits = query({
  args: {},
  handler: async () => {
    return {
      maleSlots: 1000,
      femaleSlots: 1000,
    };
  },
});

export const updateSlotLimits = mutation({
  args: {
    maleSlots: v.number(),
    femaleSlots: v.number(),
  },
  handler: async () => {
    return {
      maleSlots: 1000,
      femaleSlots: 1000,
    };
  },
});
