import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: {
    name: v.string(),
    age: v.number(),
    gender: v.union(v.literal("male"), v.literal("female")),
    maritalStatus: v.string(),
    education: v.string(),
    job: v.string(),
    email: v.string(),
    phone: v.string(),
    describeYourself: v.optional(v.string()),
    lookingFor: v.optional(v.string()),
    backgroundCheck: v.optional(v.string()),
    stripeSessionId: v.optional(v.string()),
    paymentStatus: v.optional(
      v.union(v.literal("pending"), v.literal("paid"), v.literal("failed"))
    ),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("waitlisted")
      )
    ),
  },
  handler: async (ctx, args) => {
    const registrationId = await ctx.db.insert("registrations", {
      name: args.name,
      age: args.age,
      gender: args.gender,
      maritalStatus: args.maritalStatus,
      education: args.education,
      job: args.job,
      email: args.email,
      phone: args.phone,
      describeYourself: args.describeYourself,
      lookingFor: args.lookingFor,
      backgroundCheck: args.backgroundCheck,
      stripeSessionId: args.stripeSessionId,
      paymentStatus: args.paymentStatus ?? "pending",
      status: args.status ?? "pending",
      createdAt: Date.now(),
    });

    return registrationId;
  },
});

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("registrations").collect();
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    // Count all non-rejected registrations per gender (determines slot capacity)
    const allRegistrations = await ctx.db.query("registrations").collect();
    const nonRejected = allRegistrations.filter((r) => r.status !== "rejected");

    const maleCount = nonRejected.filter((r) => r.gender === "male").length;
    const femaleCount = nonRejected.filter((r) => r.gender === "female").length;

    // Get slot limits from settings
    const maleSetting = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "maleSlots"))
      .first();
    const femaleSetting = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "femaleSlots"))
      .first();

    return {
      maleCount,
      femaleCount,
      maleLimit: maleSetting ? parseInt(maleSetting.value) : 40,
      femaleLimit: femaleSetting ? parseInt(femaleSetting.value) : 40,
    };
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("registrations"),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("waitlisted")
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: args.status,
    });
    return args.id;
  },
});

export const getById = query({
  args: {
    id: v.id("registrations"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const updatePaymentStatus = mutation({
  args: {
    stripeSessionId: v.string(),
    paymentStatus: v.union(v.literal("paid"), v.literal("failed")),
    amountPaid: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const registration = await ctx.db
      .query("registrations")
      .withIndex("by_stripeSessionId", (q) =>
        q.eq("stripeSessionId", args.stripeSessionId)
      )
      .first();

    if (!registration) {
      throw new Error(
        `Registration not found for session: ${args.stripeSessionId}`
      );
    }

    await ctx.db.patch(registration._id, {
      paymentStatus: args.paymentStatus,
      amountPaid: args.amountPaid,
    });

    return registration._id;
  },
});

export const getByStripeSession = query({
  args: {
    stripeSessionId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("registrations")
      .withIndex("by_stripeSessionId", (q) =>
        q.eq("stripeSessionId", args.stripeSessionId)
      )
      .first();
  },
});

export const updateAdminNotes = mutation({
  args: {
    id: v.id("registrations"),
    adminNotes: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      adminNotes: args.adminNotes,
    });
    return args.id;
  },
});

export const markEmailSent = mutation({
  args: {
    stripeSessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const registration = await ctx.db
      .query("registrations")
      .withIndex("by_stripeSessionId", (q) =>
        q.eq("stripeSessionId", args.stripeSessionId)
      )
      .first();

    if (registration) {
      await ctx.db.patch(registration._id, {
        confirmationEmailSent: true,
      });
    }
  },
});

export const deleteRegistration = mutation({
  args: {
    id: v.id("registrations"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
    return args.id;
  },
});
