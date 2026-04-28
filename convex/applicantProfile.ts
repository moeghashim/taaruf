import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { createInterestWithRules } from "./interestRules";

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

type ReadCtx = QueryCtx | MutationCtx;

function normalizeInterestSubmissionNumbers(values?: number[]) {
  return [...new Set((values || []).filter((value) => Number.isInteger(value) && value > 0))].slice(0, 3);
}

async function getRegistrationForSession(ctx: ReadCtx, sessionHash: string) {
  const session = await ctx.db
    .query("applicantSessions")
    .withIndex("by_sessionHash", (q) => q.eq("sessionHash", sessionHash))
    .unique();

  if (!session || session.revokedAt || session.expiresAt <= Date.now()) {
    throw new Error("Unauthorized");
  }

  const registration = await ctx.db.get(session.registrationId);
  if (!registration || registration.status !== "approved") {
    throw new Error("Unauthorized");
  }

  return registration;
}

async function syncSubmittedInterestNumbers(
  ctx: MutationCtx,
  registration: Doc<"registrations">,
  interestSubmissionNumbers?: number[]
) {
  const normalizedNumbers = normalizeInterestSubmissionNumbers(interestSubmissionNumbers);
  if (!normalizedNumbers.length) return;

  const registrations = [...(await ctx.db.query("registrations").take(1000))].sort(
    (a, b) => a._creationTime - b._creationTime
  );
  const registrationNumberMap = new Map(registrations.map((item, index) => [String(index + 1), item] as const));
  const targetIds = new Set<Id<"registrations">>();

  for (const submittedNumber of normalizedNumbers) {
    const target = registrationNumberMap.get(String(submittedNumber));
    if (target) {
      targetIds.add(target._id);
    }
  }

  for (const targetId of targetIds) {
    if (registration._id === targetId) continue;

    const targetRegistration = registrations.find((candidate) => candidate._id === targetId);
    if (!targetRegistration) continue;
    if (registration.gender === targetRegistration.gender) continue;

    try {
      await createInterestWithRules(ctx, {
        fromRegistrationId: registration._id,
        toRegistrationId: targetRegistration._id,
        source: "platform_submission",
        notes: `Submitted via applicant dashboard profile update: ${normalizedNumbers.join(", ")}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message !== "An open interest already exists for this applicant pair") {
        throw error;
      }
    }
  }
}

function fallbackInterestSubmissionNumbers(registration: Doc<"registrations">) {
  return (
    (registration.interestSubmission || "")
      .match(/\d+/g)
      ?.slice(0, 3)
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0) || []
  );
}

export const getProfile = query({
  args: {
    sessionHash: v.string(),
  },
  handler: async (ctx, args) => {
    const registration = await getRegistrationForSession(ctx, args.sessionHash);
    const imageStorageIds = registration.imageStorageIds || [];
    const imageUrls = imageStorageIds.length
      ? await Promise.all(
          imageStorageIds.map(async (storageId) => ({
            storageId,
            url: await ctx.storage.getUrl(storageId),
          }))
        )
      : [];

    return {
      registration: {
        name: registration.name,
        gender: registration.gender,
        email: registration.email,
        ethnicity: registration.ethnicity || "",
        imageStorageIds,
        imageUrls: imageUrls
          .map((image) => image.url)
          .filter((url): url is string => Boolean(url)),
        prayerCommitment: registration.prayerCommitment || "",
        hijabResponse: registration.hijabResponse || "",
        spouseRequirement1: registration.spouseRequirement1 || "",
        spouseRequirement2: registration.spouseRequirement2 || "",
        spouseRequirement3: registration.spouseRequirement3 || "",
        shareableBio: registration.shareableBio || "",
        photoSharingPermission: registration.photoSharingPermission || "",
        interestSubmission: registration.interestSubmission || "",
        interestSubmissionNumbers: registration.interestSubmissionNumbers || fallbackInterestSubmissionNumbers(registration),
        applicantNotesToAdmin: registration.applicantNotesToAdmin || "",
        profileCompletionStatus: registration.profileCompletionStatus || "not_started",
      },
    };
  },
});

export const updateProfile = mutation({
  args: {
    sessionHash: v.string(),
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
    interestSubmissionNumbers: v.optional(v.array(v.number())),
    applicantNotesToAdmin: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const registration = await getRegistrationForSession(ctx, args.sessionHash);

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
    const normalizedInterestSubmissionNumbers = normalizeInterestSubmissionNumbers(args.interestSubmissionNumbers);
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
      interestSubmission: normalizedInterestSubmissionNumbers.length
        ? normalizedInterestSubmissionNumbers.join(", ")
        : args.interestSubmission?.trim() || undefined,
      interestSubmissionNumbers: normalizedInterestSubmissionNumbers,
      applicantNotesToAdmin: args.applicantNotesToAdmin?.trim() || undefined,
      profileCompletionStatus: "completed",
      profileCompletedAt: registration.profileCompletedAt ?? now,
      profileLastUpdatedAt: now,
    });

    await syncSubmittedInterestNumbers(ctx, registration, normalizedInterestSubmissionNumbers);

    return registration._id;
  },
});
