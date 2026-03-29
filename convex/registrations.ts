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
      paymentStatus: "pending",
      createdAt: Date.now(),
    });

    return registrationId;
  },
});

export const updatePaymentStatus = mutation({
  args: {
    stripeSessionId: v.string(),
    paymentStatus: v.union(
      v.literal("pending"),
      v.literal("paid"),
      v.literal("failed")
    ),
  },
  handler: async (ctx, args) => {
    const registration = await ctx.db
      .query("registrations")
      .withIndex("by_stripeSessionId", (q) =>
        q.eq("stripeSessionId", args.stripeSessionId)
      )
      .first();

    if (!registration) {
      throw new Error("Registration not found");
    }

    await ctx.db.patch(registration._id, {
      paymentStatus: args.paymentStatus,
    });

    return registration._id;
  },
});

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("registrations").collect();
  },
});

export const getPaidRegistrations = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("registrations")
      .withIndex("by_paymentStatus", (q) => q.eq("paymentStatus", "paid"))
      .collect();
  },
});

export const getCountByGender = query({
  args: {},
  handler: async (ctx) => {
    const paidRegistrations = await ctx.db
      .query("registrations")
      .withIndex("by_paymentStatus", (q) => q.eq("paymentStatus", "paid"))
      .collect();

    const maleCount = paidRegistrations.filter(
      (r) => r.gender === "male"
    ).length;
    const femaleCount = paidRegistrations.filter(
      (r) => r.gender === "female"
    ).length;

    return {
      male: maleCount,
      female: femaleCount,
    };
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const paidRegistrations = await ctx.db
      .query("registrations")
      .withIndex("by_paymentStatus", (q) => q.eq("paymentStatus", "paid"))
      .collect();

    const maleCount = paidRegistrations.filter((r) => r.gender === "male").length;
    const femaleCount = paidRegistrations.filter((r) => r.gender === "female").length;

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

export const updateStripeSessionId = mutation({
  args: {
    registrationId: v.id("registrations"),
    stripeSessionId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.registrationId, {
      stripeSessionId: args.stripeSessionId,
    });
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

export const deleteRegistration = mutation({
  args: {
    id: v.id("registrations"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
    return args.id;
  },
});
