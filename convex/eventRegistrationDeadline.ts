import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireEventAdmin } from "./eventCapacity";

/** Authorized November 14 closure: metadata only, never process the roster. */
export const closeNovember14 = mutation({
  args: { adminSecret: v.string(), eventId: v.id("events"), expectedUpdatedAt: v.number() },
  handler: async (ctx, args) => {
    requireEventAdmin(args.adminSecret);
    const event = await ctx.db.get(args.eventId);
    if (!event || event.eventCode !== "nov26" || event.startsAt !== 1794681900000) {
      throw new Error("Not the November 14, 2026 event");
    }
    if (event.status !== "scheduled") throw new Error("Event must remain scheduled");
    const now = Date.now();
    if (now >= event.startsAt) throw new Error("Event has already started");
    if (event.registrationClosesAt !== undefined && event.registrationClosesAt < now) {
      return { changed: false, registrationClosesAt: event.registrationClosesAt };
    }
    if (event.updatedAt !== args.expectedUpdatedAt) throw new Error("Event changed; refresh before closing");
    const registrationClosesAt = now - 1;
    await ctx.db.patch(event._id, { registrationClosesAt, updatedAt: now });
    return { changed: true, registrationClosesAt };
  },
});
