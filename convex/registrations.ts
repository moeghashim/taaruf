import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const prayerCommitment = v.union(
  v.literal("sometimes"),
  v.literal("strive_five"),
  v.literal("always_five"),
  v.literal("five_and_sunnah")
);
const yesNoOpen = v.union(v.literal("yes"), v.literal("no"), v.literal("open"));
const photoSharingPermission = v.union(
  v.literal("yes"),
  v.literal("no"),
  v.literal("ask_me_first")
);
const searchStatus = v.union(v.literal("active"), v.literal("paused"), v.literal("inactive"));
const openInterestStatuses = new Set(["new", "queued", "active", "deferred"]);

function deriveInterestVisibility(fromGender: "male" | "female", toGender: "male" | "female") {
  if (fromGender === toGender) {
    throw new Error("Interest must be between opposite-gender applicants");
  }

  if (fromGender === "female" && toGender === "male") {
    return "internal_only" as const;
  }

  return "admin_actionable" as const;
}

async function syncSubmittedInterests(ctx: any, registration: any, rawInterestSubmission?: string) {
  const trimmedSubmission = rawInterestSubmission?.trim();
  if (!trimmedSubmission) return;

  const registrations = [...(await ctx.db.query("registrations").collect())].sort(
    (a, b) => a._creationTime - b._creationTime
  );
  const registrationNumberMap = new Map(registrations.map((item, index) => [String(index + 1), item] as const));

  const candidateTokens = trimmedSubmission
    .split(/[\n,;]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const targetIds = new Set<string>();

  const numericMatches = trimmedSubmission.match(/#?\d+/g) || [];
  for (const match of numericMatches) {
    const normalized = match.replace("#", "").trim();
    const target = registrationNumberMap.get(normalized);
    if (target) {
      targetIds.add(String(target._id));
    }
  }

  for (const token of candidateTokens) {
    if (/^#?\d+$/.test(token)) continue;
    const normalizedToken = token.toLowerCase();
    const byName = registrations.find(
      (candidate) => candidate.name.trim().toLowerCase() === normalizedToken
    );
    if (byName) {
      targetIds.add(String(byName._id));
    }
  }

  if (!targetIds.size) return;

  const existingInterests = await ctx.db
    .query("interests")
    .withIndex("by_fromRegistrationId", (q: any) => q.eq("fromRegistrationId", registration._id))
    .collect();

  const now = Date.now();
  for (const targetId of targetIds) {
    if (String(registration._id) === targetId) continue;

    const targetRegistration = registrations.find((candidate) => String(candidate._id) === targetId);
    if (!targetRegistration) continue;
    if (registration.gender === targetRegistration.gender) continue;

    const duplicateOpenInterest = existingInterests.find(
      (interest: any) => String(interest.toRegistrationId) === targetId && openInterestStatuses.has(interest.status)
    );
    if (duplicateOpenInterest) continue;

    await ctx.db.insert("interests", {
      fromRegistrationId: registration._id,
      toRegistrationId: targetRegistration._id,
      source: "platform_submission",
      status: "new",
      visibility: deriveInterestVisibility(registration.gender, targetRegistration.gender),
      adminStatus: "pending",
      notes: `Submitted via profile update: ${trimmedSubmission}`,
      createdAt: now,
      updatedAt: now,
    });
  }
}

function hasCompletedProfile(args: {
  ethnicity?: string;
  imageStorageIds?: Array<unknown>;
  prayerCommitment?: string;
  hijabResponse?: string;
  spouseRequirement1?: string;
  spouseRequirement2?: string;
  spouseRequirement3?: string;
  shareableBio?: string;
  photoSharingPermission?: string;
}) {
  return Boolean(
    args.ethnicity?.trim() &&
    args.imageStorageIds?.length &&
    args.prayerCommitment &&
    args.hijabResponse &&
    args.spouseRequirement1?.trim() &&
    args.spouseRequirement2?.trim() &&
    args.spouseRequirement3?.trim() &&
    args.shareableBio?.trim() &&
    args.photoSharingPermission
  );
}

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
    status: v.optional(v.union(v.literal("pending"), v.literal("waitlisted"))),
    profileAccessToken: v.optional(v.string()),
    ethnicity: v.optional(v.string()),
    imageStorageIds: v.optional(v.array(v.id("_storage"))),
    prayerCommitment: v.optional(prayerCommitment),
    hijabResponse: v.optional(yesNoOpen),
    spouseRequirement1: v.optional(v.string()),
    spouseRequirement2: v.optional(v.string()),
    spouseRequirement3: v.optional(v.string()),
    shareableBio: v.optional(v.string()),
    photoSharingPermission: v.optional(photoSharingPermission),
    interestSubmission: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const profileCompleted = hasCompletedProfile(args);

    return await ctx.db.insert("registrations", {
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
      searchStatus: "active",
      createdAt: now,
      profileAccessToken: args.profileAccessToken,
      profileCompletionStatus: profileCompleted ? "completed" : "not_started",
      profileCompletedAt: profileCompleted ? now : undefined,
      profileLastUpdatedAt: profileCompleted ? now : undefined,
      ethnicity: args.ethnicity,
      imageStorageIds: args.imageStorageIds,
      prayerCommitment: args.prayerCommitment,
      hijabResponse: args.hijabResponse,
      spouseRequirement1: args.spouseRequirement1,
      spouseRequirement2: args.spouseRequirement2,
      spouseRequirement3: args.spouseRequirement3,
      shareableBio: args.shareableBio,
      photoSharingPermission: args.photoSharingPermission,
      interestSubmission: args.interestSubmission?.trim() || undefined,
    });
  },
});

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    const registrations = await ctx.db.query("registrations").collect();

    return await Promise.all(
      registrations.map(async (registration) => {
        const imageStorageIds = registration.imageStorageIds || [];
        const imageUrls = await Promise.all(
          imageStorageIds.map((storageId) => ctx.storage.getUrl(storageId))
        );

        return {
          ...registration,
          imageUrls: imageUrls.filter((url): url is string => Boolean(url)),
        };
      })
    );
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const allRegistrations = await ctx.db.query("registrations").collect();
    const nonRejected = allRegistrations.filter((r) => r.status !== "rejected");

    const maleCount = nonRejected.filter((r) => r.gender === "male").length;
    const femaleCount = nonRejected.filter((r) => r.gender === "female").length;

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
    await ctx.db.patch(args.id, { status: args.status });
    return args.id;
  },
});

export const updateSearchStatus = mutation({
  args: {
    id: v.id("registrations"),
    searchStatus,
    searchStatusNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      searchStatus: args.searchStatus,
      searchStatusNote: args.searchStatusNote,
    });
    return args.id;
  },
});

export const setProfileAccessToken = mutation({
  args: {
    id: v.id("registrations"),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      profileAccessToken: args.token,
      profileCompletionStatus: "in_progress",
      profileUpdateRequestedAt: Date.now(),
    });
    return args.id;
  },
});

export const markProfileUpdateEmailSent = mutation({
  args: {
    id: v.id("registrations"),
    sent: v.boolean(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      profileUpdateRequestedAt: Date.now(),
      profileUpdateEmailSent: args.sent,
      profileUpdateEmailSentAt: args.sent ? Date.now() : undefined,
      profileUpdateEmailError: args.error,
      profileCompletionStatus: args.sent ? "in_progress" : undefined,
    });
    return args.id;
  },
});

export const generateImageUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const getImageUrls = query({
  args: {
    storageIds: v.array(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    return await Promise.all(
      args.storageIds.map(async (storageId) => ({
        storageId,
        url: await ctx.storage.getUrl(storageId),
      }))
    );
  },
});

export const getById = query({
  args: { id: v.id("registrations") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getByProfileAccessToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("registrations")
      .withIndex("by_profileAccessToken", (q) => q.eq("profileAccessToken", args.token))
      .first();
  },
});

export const updateProfile = mutation({
  args: {
    token: v.string(),
    ethnicity: v.string(),
    imageStorageIds: v.array(v.id("_storage")),
    prayerCommitment,
    hijabResponse: yesNoOpen,
    spouseRequirement1: v.string(),
    spouseRequirement2: v.string(),
    spouseRequirement3: v.string(),
    shareableBio: v.string(),
    photoSharingPermission,
    interestSubmission: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const registration = await ctx.db
      .query("registrations")
      .withIndex("by_profileAccessToken", (q) => q.eq("profileAccessToken", args.token))
      .first();

    if (!registration) {
      throw new Error("Profile not found");
    }

    if (!args.ethnicity.trim()) throw new Error("Ethnicity is required");
    if (args.imageStorageIds.length < 1 || args.imageStorageIds.length > 3) {
      throw new Error("Profile must include between 1 and 3 images");
    }
    if (!args.spouseRequirement1.trim() || !args.spouseRequirement2.trim() || !args.spouseRequirement3.trim()) {
      throw new Error("All three spouse requirements are required");
    }
    if (!args.shareableBio.trim()) {
      throw new Error("Basic bio is required");
    }

    const now = Date.now();

    await ctx.db.patch(registration._id, {
      ethnicity: args.ethnicity.trim(),
      imageStorageIds: args.imageStorageIds,
      prayerCommitment: args.prayerCommitment,
      hijabResponse: args.hijabResponse,
      spouseRequirement1: args.spouseRequirement1.trim(),
      spouseRequirement2: args.spouseRequirement2.trim(),
      spouseRequirement3: args.spouseRequirement3.trim(),
      shareableBio: args.shareableBio.trim(),
      photoSharingPermission: args.photoSharingPermission,
      interestSubmission: args.interestSubmission?.trim() || undefined,
      profileCompletionStatus: "completed",
      profileCompletedAt: registration.profileCompletedAt ?? now,
      profileLastUpdatedAt: now,
    });

    await syncSubmittedInterests(ctx, registration, args.interestSubmission);

    return registration._id;
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
      .withIndex("by_stripeSessionId", (q) => q.eq("stripeSessionId", args.stripeSessionId))
      .first();

    if (!registration) {
      throw new Error(`Registration not found for session: ${args.stripeSessionId}`);
    }

    await ctx.db.patch(registration._id, {
      paymentStatus: args.paymentStatus,
      amountPaid: args.amountPaid,
    });

    return registration._id;
  },
});

export const getByStripeSession = query({
  args: { stripeSessionId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("registrations")
      .withIndex("by_stripeSessionId", (q) => q.eq("stripeSessionId", args.stripeSessionId))
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
      .withIndex("by_stripeSessionId", (q) => q.eq("stripeSessionId", args.stripeSessionId))
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
