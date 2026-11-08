import { CAPABILITY_CUTOFF_KEY } from "./capabilitySecurity";
import { requireAdmin } from "./adminAuthorization";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  args: { adminSecret: v.optional(v.string()),
    key: v.string(),
  },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    const setting = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();

    return setting?.value ?? null;
  },
});

export const set = mutation({
  args: { adminSecret: v.optional(v.string()),
    key: v.string(),
    value: v.string(),
  },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();

    if (args.key === CAPABILITY_CUTOFF_KEY) {
      const cutoff = Number(args.value);
      const previous = existing ? Number(existing.value) : 0;
      if (!/^[0-9]+$/.test(args.value) || !Number.isSafeInteger(cutoff) || cutoff <= 0 || cutoff > Date.now() ||
          (existing && (!Number.isSafeInteger(previous) || cutoff < previous))) {
        throw new Error("Cutoff must be valid, nonfuture and monotonic; never disable revocation");
      }
    }
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
