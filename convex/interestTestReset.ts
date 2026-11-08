import { mutation } from "./_generated/server";
import { v } from "convex/values";

// Explicit per-record designation, never inferred from an applicant's name.
export const reset = mutation({
  args: { adminSecret: v.string(), id: v.id("interests"), reason: v.string(), confirmTest: v.literal(true) },
  handler: async (ctx, args) => {
    if (!process.env.ATTENDANCE_ADMIN_SECRET || args.adminSecret !== process.env.ATTENDANCE_ADMIN_SECRET) throw new Error("Unauthorized");
    const reason = args.reason.trim();
    if (reason.length < 10 || reason.length > 500) throw new Error("Provide a test-reset reason of 10–500 characters");
    const interest = await ctx.db.get(args.id);
    if (!interest) throw new Error("Interest not found");
    if (interest.testReset) return { alreadyReset: true };
    if (interest.source !== "platform_submission") throw new Error("Only applicant submissions can use test reset");
    const flow = await ctx.db.query("interestFlows").withIndex("by_interestId", q => q.eq("interestId", args.id)).unique();
    if (!flow) throw new Error("Missing workflow: manual review required");
    if (interest.matchId || interest.status === "converted_to_match" || interest.adminStatus === "matched" || flow.contactSharedAt) throw new Error("Linked match or contact history requires manual review");
    // Fail closed for reciprocal history, including closed records and earlier resets.
    const reciprocal = await ctx.db.query("interests").withIndex("by_fromRegistrationId_and_toRegistrationId", q => q.eq("fromRegistrationId", interest.toRegistrationId).eq("toRegistrationId", interest.fromRegistrationId)).first();
    if (reciprocal) throw new Error("Reciprocal interest history requires manual review");
    for (const id of [interest.fromRegistrationId, interest.toRegistrationId]) {
      for await (const match of ctx.db.query("matches").withIndex("by_maleRegistrationId", q => q.eq("maleRegistrationId", id))) {
        if ([interest.fromRegistrationId, interest.toRegistrationId].includes(match.femaleRegistrationId) || match.interestId === interest._id) throw new Error("Linked match or contact history requires manual review");
      }
      for await (const share of ctx.db.query("profileShares").withIndex("by_ownerRegistrationId", q => q.eq("ownerRegistrationId", id))) {
        if ([interest.fromRegistrationId, interest.toRegistrationId].includes(share.recipientRegistrationId) || share.interestId === interest._id) throw new Error("Profile-share history requires manual review");
      }
    }
    // Same-direction older events may retain contact history after pair reset deleted the match.
    for await (const historical of ctx.db.query("interests").withIndex("by_fromRegistrationId_and_toRegistrationId", q => q.eq("fromRegistrationId", interest.fromRegistrationId).eq("toRegistrationId", interest.toRegistrationId))) {
      const historicalFlow = await ctx.db.query("interestFlows").withIndex("by_interestId", q => q.eq("interestId", historical._id)).unique();
      if (historical.matchId || historicalFlow?.contactSharedAt) throw new Error("Linked match or contact history requires manual review");
      for await (const event of ctx.db.query("interestFlowEvents").withIndex("by_interestId", q => q.eq("interestId", historical._id))) {
        if (["contacts_disclosed_in_portal", "pair_reset"].includes(event.eventType)) throw new Error("Linked match or contact history requires manual review");
      }
    }
    const now = Date.now();
    await ctx.db.patch(args.id, { testReset: { at: now, reason, actor: "admin" }, status: "closed", adminStatus: "pending", updatedAt: now });
    await ctx.db.patch(flow._id, { flowStatus: "closed", closedReason: "admin_test_reset", photoDecision: "pending", photoRequestedByRegistrationId: undefined, photosVisibleAt: undefined, bioVisibleAt: undefined, keepOpenExpiresAt: undefined, updatedAt: now });
    await ctx.db.insert("interestFlowEvents", { interestFlowId: flow._id, interestId: args.id, actor: "admin", eventType: "admin_test_reset", message: reason, createdAt: now });
    return { alreadyReset: false };
  },
});
