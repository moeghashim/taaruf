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

export const getSlotLimits = query({
  args: {},
  handler: async (ctx) => {
    const maleSlotsSetting = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "maleSlots"))
      .first();

    const femaleSlotsSetting = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "femaleSlots"))
      .first();

    return {
      maleSlots: maleSlotsSetting ? parseInt(maleSlotsSetting.value) : 40,
      femaleSlots: femaleSlotsSetting ? parseInt(femaleSlotsSetting.value) : 40,
    };
  },
});

export const updateSlotLimits = mutation({
  args: {
    maleSlots: v.number(),
    femaleSlots: v.number(),
  },
  handler: async (ctx, args) => {
    const maleSlotsSetting = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "maleSlots"))
      .first();

    const femaleSlotsSetting = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "femaleSlots"))
      .first();

    if (maleSlotsSetting) {
      await ctx.db.patch(maleSlotsSetting._id, {
        value: args.maleSlots.toString(),
      });
    } else {
      await ctx.db.insert("settings", {
        key: "maleSlots",
        value: args.maleSlots.toString(),
      });
    }

    if (femaleSlotsSetting) {
      await ctx.db.patch(femaleSlotsSetting._id, {
        value: args.femaleSlots.toString(),
      });
    } else {
      await ctx.db.insert("settings", {
        key: "femaleSlots",
        value: args.femaleSlots.toString(),
      });
    }

    return {
      maleSlots: args.maleSlots,
      femaleSlots: args.femaleSlots,
    };
  },
});
