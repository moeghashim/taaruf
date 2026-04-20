import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const interestSource = v.union(
  v.literal("admin_entered"),
  v.literal("email"),
  v.literal("whatsapp"),
  v.literal("platform_submission")
);
const interestStatus = v.union(
  v.literal("new"),
  v.literal("queued"),
  v.literal("active"),
  v.literal("converted_to_match"),
  v.literal("deferred"),
  v.literal("withdrawn"),
  v.literal("declined"),
  v.literal("closed")
);
const interestVisibility = v.union(
  v.literal("internal_only"),
  v.literal("admin_actionable")
);
const interestAdminStatus = v.union(
  v.literal("pending"),
  v.literal("requested"),
  v.literal("declined"),
  v.literal("matched")
);

const openInterestStatuses = new Set(["new", "queued", "active", "deferred"]);

async function getRegistrationOrThrow(ctx: any, id: any) {
  const registration = await ctx.db.get(id);
  if (!registration) {
    throw new Error("Registration not found");
  }
  return registration;
}

function deriveVisibility(fromGender: "male" | "female", toGender: "male" | "female") {
  if (fromGender === toGender) {
    throw new Error("Interest must be between opposite-gender applicants");
  }

  if (fromGender === "female" && toGender === "male") {
    return "internal_only" as const;
  }

  return "admin_actionable" as const;
}

function deriveInterestType(fromGender: "male" | "female") {
  return fromGender === "male" ? "man_interested" : "woman_interested";
}

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    const interests = await ctx.db.query("interests").collect();

    return await Promise.all(
      interests.map(async (interest) => {
        const fromRegistration = await ctx.db.get(interest.fromRegistrationId);
        const toRegistration = await ctx.db.get(interest.toRegistrationId);
        const match = interest.matchId ? await ctx.db.get(interest.matchId) : null;

        return {
          ...interest,
          fromRegistration,
          toRegistration,
          match,
        };
      })
    );
  },
});

export const create = mutation({
  args: {
    fromRegistrationId: v.id("registrations"),
    toRegistrationId: v.id("registrations"),
    rank: v.optional(v.number()),
    source: interestSource,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.fromRegistrationId === args.toRegistrationId) {
      throw new Error("Applicant cannot express interest in themselves");
    }

    const fromRegistration = await getRegistrationOrThrow(ctx, args.fromRegistrationId);
    const toRegistration = await getRegistrationOrThrow(ctx, args.toRegistrationId);
    const visibility = deriveVisibility(fromRegistration.gender, toRegistration.gender);

    const existingInterests = await ctx.db
      .query("interests")
      .withIndex("by_fromRegistrationId", (q) => q.eq("fromRegistrationId", args.fromRegistrationId))
      .collect();

    const duplicateOpenInterest = existingInterests.find(
      (interest) =>
        interest.toRegistrationId === args.toRegistrationId && openInterestStatuses.has(interest.status)
    );

    if (duplicateOpenInterest) {
      throw new Error("An open interest already exists for this applicant pair");
    }

    const now = Date.now();
    return await ctx.db.insert("interests", {
      fromRegistrationId: args.fromRegistrationId,
      toRegistrationId: args.toRegistrationId,
      rank: args.rank,
      source: args.source,
      status: "new",
      visibility,
      adminStatus: "pending",
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateAdminStatus = mutation({
  args: {
    id: v.id("interests"),
    adminStatus: interestAdminStatus,
  },
  handler: async (ctx, args) => {
    const interest = await ctx.db.get(args.id);
    if (!interest) {
      throw new Error("Interest not found");
    }

    await ctx.db.patch(args.id, {
      adminStatus: args.adminStatus,
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

export const updateNotes = mutation({
  args: {
    id: v.id("interests"),
    notes: v.string(),
  },
  handler: async (ctx, args) => {
    const interest = await ctx.db.get(args.id);
    if (!interest) {
      throw new Error("Interest not found");
    }

    await ctx.db.patch(args.id, {
      notes: args.notes.trim() || undefined,
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("interests"),
    status: interestStatus,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const interest = await ctx.db.get(args.id);
    if (!interest) {
      throw new Error("Interest not found");
    }

    await ctx.db.patch(args.id, {
      status: args.status,
      notes: args.notes ?? interest.notes,
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

export const updateRank = mutation({
  args: {
    id: v.id("interests"),
    rank: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const interest = await ctx.db.get(args.id);
    if (!interest) {
      throw new Error("Interest not found");
    }

    await ctx.db.patch(args.id, {
      rank: args.rank,
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

export const remove = mutation({
  args: {
    id: v.id("interests"),
  },
  handler: async (ctx, args) => {
    const interest = await ctx.db.get(args.id);
    if (!interest) {
      throw new Error("Interest not found");
    }

    if (interest.matchId) {
      throw new Error("Cannot delete an interest that is already linked to a match");
    }

    await ctx.db.delete(args.id);
    return args.id;
  },
});

export const progressFirst = mutation({
  args: {
    interestId: v.id("interests"),
  },
  handler: async (ctx, args) => {
    const interest = await ctx.db.get(args.interestId);
    if (!interest) {
      throw new Error("Interest not found");
    }

    const now = Date.now();
    const inboundCompetitors = await ctx.db
      .query("interests")
      .withIndex("by_toRegistrationId", (q) => q.eq("toRegistrationId", interest.toRegistrationId))
      .collect();
    const outboundAlternatives = await ctx.db
      .query("interests")
      .withIndex("by_fromRegistrationId", (q) => q.eq("fromRegistrationId", interest.fromRegistrationId))
      .collect();

    for (const competitor of inboundCompetitors) {
      if (competitor._id === interest._id) continue;
      if (!openInterestStatuses.has(competitor.status)) continue;
      await ctx.db.patch(competitor._id, {
        status: "queued",
        updatedAt: now,
      });
    }

    for (const alternative of outboundAlternatives) {
      if (alternative._id === interest._id) continue;
      if (!openInterestStatuses.has(alternative.status)) continue;
      await ctx.db.patch(alternative._id, {
        status: "queued",
        updatedAt: now,
      });
    }

    await ctx.db.patch(args.interestId, {
      status: "active",
      updatedAt: now,
    });

    return args.interestId;
  },
});

export const convertToMatch = mutation({
  args: {
    interestId: v.id("interests"),
    adminNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const interest = await ctx.db.get(args.interestId);
    if (!interest) {
      throw new Error("Interest not found");
    }

    if (interest.matchId) {
      throw new Error("Interest already linked to a match");
    }

    const fromRegistration = await getRegistrationOrThrow(ctx, interest.fromRegistrationId);
    const toRegistration = await getRegistrationOrThrow(ctx, interest.toRegistrationId);
    deriveVisibility(fromRegistration.gender, toRegistration.gender);

    const maleRegistrationId =
      fromRegistration.gender === "male" ? interest.fromRegistrationId : interest.toRegistrationId;
    const femaleRegistrationId =
      fromRegistration.gender === "female" ? interest.fromRegistrationId : interest.toRegistrationId;
    const now = Date.now();

    const matchId = await ctx.db.insert("matches", {
      maleRegistrationId,
      femaleRegistrationId,
      interestType: deriveInterestType(fromRegistration.gender),
      status: "new",
      adminNotes: args.adminNotes ?? interest.notes,
      interestId: args.interestId,
      initiatedBy: "interest_signal",
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(args.interestId, {
      matchId,
      status: "converted_to_match",
      adminStatus: "matched",
      updatedAt: now,
    });

    await ctx.db.patch(interest.fromRegistrationId, {
      activeMatchId: matchId,
    });
    await ctx.db.patch(interest.toRegistrationId, {
      activeMatchId: matchId,
    });

    return matchId;
  },
});

export const getByRegistration = query({
  args: {
    registrationId: v.id("registrations"),
  },
  handler: async (ctx, args) => {
    const outbound = await ctx.db
      .query("interests")
      .withIndex("by_fromRegistrationId", (q) => q.eq("fromRegistrationId", args.registrationId))
      .collect();
    const inbound = await ctx.db
      .query("interests")
      .withIndex("by_toRegistrationId", (q) => q.eq("toRegistrationId", args.registrationId))
      .collect();

    return {
      outbound,
      inbound,
    };
  },
});
