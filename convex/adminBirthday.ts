import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./adminAuthorization";

/** One admin-opened profile only; never join birthdays into broad/shared records. */
export const get = query({
  args: { adminSecret: v.optional(v.string()), registrationId: v.id("registrations") },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    if (!await ctx.db.get(args.registrationId)) return null;
    const birthday = await ctx.db.query("registrationBirthdays").withIndex("by_registrationId", q => q.eq("registrationId", args.registrationId)).unique();
    return birthday ? { dateOfBirth: birthday.dateOfBirth } : null;
  },
});
