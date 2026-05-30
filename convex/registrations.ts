// INVARIANT (see AGENTS.md): `registrations.publicApplicantNumber` is the
// permanent public identifier. Once assigned it is never patched and never
// re-used, not even after deleteRegistration. The `create` mutation and the
// one-time backfill are the only production code paths that write the field.

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { deriveEligibilityStatus, getEventByCode } from "./eventRules";
import { createApplicantInterestWithRules } from "./interestRules";
import { buildRegistrationNumberMaps } from "./registrationNumbers";

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

function normalizeInterestSubmissionNumbers(values?: number[]) {
  return [...new Set((values || []).filter((value) => Number.isInteger(value) && value > 0))].slice(0, 3);
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7 ? digits : "";
}

function normalizeName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

const APPLICANT_NUMBER_HWM_KEY = "applicantNumberHighWaterMark";
const PUBLIC_APPLICANT_NUMBER_HWM_KEY = "publicApplicantNumberHighWaterMark";

// INVARIANT (see AGENTS.md): applicant numbers are permanent. Once assigned
// they are never patched and never re-used, even if the underlying
// registration is deleted. A monotonic high-water-mark in `settings` (key
// `applicantNumberHighWaterMark`) keeps the counter from rolling backward on
// delete. Live registrations are still scanned defensively to recover from
// any out-of-band insert that didn't go through this helper, and the chosen
// number is asserted unused via the `by_applicantNumber` index before we
// hand it back — so any future bug that lets the counter drift cannot
// silently produce a duplicate.
async function nextApplicantNumber(ctx: MutationCtx) {
  const hwmRow = await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", APPLICANT_NUMBER_HWM_KEY))
    .first();
  const persistedHwm = hwmRow ? Number.parseInt(hwmRow.value, 10) : 0;

  let liveMax = 0;
  for await (const registration of ctx.db.query("registrations")) {
    if (
      typeof registration.applicantNumber === "number" &&
      Number.isInteger(registration.applicantNumber) &&
      registration.applicantNumber > liveMax
    ) {
      liveMax = registration.applicantNumber;
    }
  }

  const previousHwm = Math.max(Number.isFinite(persistedHwm) ? persistedHwm : 0, liveMax);
  const nextNumber = previousHwm + 1;

  const collision = await ctx.db
    .query("registrations")
    .withIndex("by_applicantNumber", (q) => q.eq("applicantNumber", nextNumber))
    .first();
  if (collision) {
    throw new Error(
      `Applicant number invariant violated: number ${nextNumber} is already assigned (registration ${collision._id}). Refusing to reuse.`
    );
  }

  if (hwmRow) {
    await ctx.db.patch(hwmRow._id, { value: String(nextNumber) });
  } else {
    await ctx.db.insert("settings", {
      key: APPLICANT_NUMBER_HWM_KEY,
      value: String(nextNumber),
    });
  }

  return nextNumber;
}

// INVARIANT: public applicant numbers are the human-facing identifiers used
// in admin, applicant dashboards, interest submission, and exports. They are
// backed by their own monotonic high-water-mark and must never be reused after
// deleteRegistration.
async function nextPublicApplicantNumber(ctx: MutationCtx) {
  const hwmRow = await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", PUBLIC_APPLICANT_NUMBER_HWM_KEY))
    .first();
  const persistedHwm = hwmRow ? Number.parseInt(hwmRow.value, 10) : 0;

  let liveMax = 0;
  let liveCount = 0;
  for await (const registration of ctx.db.query("registrations")) {
    liveCount += 1;
    if (
      typeof registration.publicApplicantNumber === "number" &&
      Number.isInteger(registration.publicApplicantNumber) &&
      registration.publicApplicantNumber > liveMax
    ) {
      liveMax = registration.publicApplicantNumber;
    }
  }

  const previousHwm = Math.max(Number.isFinite(persistedHwm) ? persistedHwm : 0, liveMax, liveCount);
  const nextNumber = previousHwm + 1;

  const collision = await ctx.db
    .query("registrations")
    .withIndex("by_publicApplicantNumber", (q) => q.eq("publicApplicantNumber", nextNumber))
    .first();
  if (collision) {
    throw new Error(
      `Public applicant number invariant violated: number ${nextNumber} is already assigned (registration ${collision._id}). Refusing to reuse.`
    );
  }

  if (hwmRow) {
    await ctx.db.patch(hwmRow._id, { value: String(nextNumber) });
  } else {
    await ctx.db.insert("settings", {
      key: PUBLIC_APPLICANT_NUMBER_HWM_KEY,
      value: String(nextNumber),
    });
  }

  return nextNumber;
}

async function countCapacityUsed(
  ctx: MutationCtx,
  eventId: Id<"events">,
  gender: "male" | "female"
) {
  const rows = await ctx.db
    .query("eventRegistrations")
    .withIndex("by_eventId_and_gender_and_registrationStatus", (q) =>
      q.eq("eventId", eventId).eq("gender", gender).eq("registrationStatus", "approved")
    )
    .take(500);
  return rows.length;
}

async function eventRegistrationStatusForCapacity(
  ctx: MutationCtx,
  event: Doc<"events">,
  gender: "male" | "female"
) {
  const capacity = gender === "male" ? event.maleCapacity : event.femaleCapacity;
  const used = await countCapacityUsed(ctx, event._id, gender);
  return used < capacity ? "pending" as const : "pending" as const;
}

async function findExistingParticipantProfile(
  ctx: MutationCtx,
  args: {
    name: string;
    age: number;
    gender: "male" | "female";
    email: string;
    phone: string;
  },
  useSecondaryIdentifiers: boolean
) {
  const emailCanonical = normalizeEmail(args.email);
  const phoneCanonical = normalizePhone(args.phone);
  const nameCanonical = normalizeName(args.name);

  if (emailCanonical) {
    const byCanonicalEmail = await ctx.db
      .query("registrations")
      .withIndex("by_emailCanonical", (q) => q.eq("emailCanonical", emailCanonical))
      .first();
    if (byCanonicalEmail) return byCanonicalEmail;

    const legacyEmailMatch = (await ctx.db.query("registrations").take(1000)).find(
      (registration) => normalizeEmail(registration.email) === emailCanonical
    );
    if (legacyEmailMatch) return legacyEmailMatch;
  }

  if (!useSecondaryIdentifiers) return null;

  if (phoneCanonical) {
    const byCanonicalPhone = await ctx.db
      .query("registrations")
      .withIndex("by_phoneCanonical", (q) => q.eq("phoneCanonical", phoneCanonical))
      .first();
    if (byCanonicalPhone) return byCanonicalPhone;

    const legacyPhoneMatch = (await ctx.db.query("registrations").take(1000)).find(
      (registration) => normalizePhone(registration.phone) === phoneCanonical
    );
    if (legacyPhoneMatch) return legacyPhoneMatch;
  }

  if (nameCanonical) {
    const nameMatches = (await ctx.db
      .query("registrations")
      .withIndex("by_nameCanonical", (q) => q.eq("nameCanonical", nameCanonical))
      .take(10))
      .filter((registration) => registration.gender === args.gender && registration.age === args.age);
    if (nameMatches.length === 1) return nameMatches[0];

    const legacyNameMatches = (await ctx.db.query("registrations").take(1000)).filter(
      (registration) =>
        normalizeName(registration.name) === nameCanonical &&
        registration.gender === args.gender &&
        registration.age === args.age
    );
    if (legacyNameMatches.length === 1) return legacyNameMatches[0];
  }

  return null;
}

async function createOrRestoreEventRegistration(
  ctx: MutationCtx,
  args: {
    event: Doc<"events">;
    registration: Doc<"registrations">;
    now: number;
  }
) {
  if (
    typeof args.registration.publicApplicantNumber !== "number" &&
    typeof args.registration.applicantNumber !== "number"
  ) {
    throw new Error("Existing profile is missing a profile number. Please contact admin before registering for this event.");
  }

  const existing = await ctx.db
    .query("eventRegistrations")
    .withIndex("by_eventId_and_registrationId", (q) =>
      q.eq("eventId", args.event._id).eq("registrationId", args.registration._id)
    )
    .unique();
  if (existing && !["withdrawn", "rejected"].includes(existing.registrationStatus)) {
    throw new Error("This applicant is already registered for this event.");
  }

  const registrationStatus = await eventRegistrationStatusForCapacity(ctx, args.event, args.registration.gender);
  const payload = {
    eventId: args.event._id,
    registrationId: args.registration._id,
    gender: args.registration.gender,
    registrationStatus,
    confirmationStatus: "confirmed" as const,
    attendanceStatus: "not_checked_in" as const,
    eligibilityStatus: deriveEligibilityStatus(args.registration),
    confirmedAt: args.now,
    confirmationRequestedAt: undefined,
    confirmationExpiresAt: undefined,
    cancelledAt: undefined,
    rejectedAt: undefined,
    createdAt: existing?.createdAt ?? args.now,
    updatedAt: args.now,
  };

  if (existing) {
    await ctx.db.patch(existing._id, payload);
    return existing._id;
  }

  return await ctx.db.insert("eventRegistrations", payload);
}

async function validatePublicEventRegistration(ctx: MutationCtx, eventCode: string) {
  const event = await getEventByCode(ctx, eventCode.trim());
  if (!event) throw new Error("Event not found");
  if (event.status !== "scheduled") throw new Error("Event registration is not open");

  const now = Date.now();
  if (event.registrationOpensAt && event.registrationOpensAt > now) {
    throw new Error("Event registration is not open yet");
  }
  if (event.registrationClosesAt && event.registrationClosesAt < now) {
    throw new Error("Event registration is closed");
  }

  return event;
}

async function syncSubmittedInterestNumbers(
  ctx: MutationCtx,
  registrationId: Id<"registrations">,
  interestSubmissionNumbers?: number[]
) {
  const normalizedNumbers = normalizeInterestSubmissionNumbers(interestSubmissionNumbers);
  if (!normalizedNumbers.length) return;

  const registration = await ctx.db.get(registrationId);
  if (!registration) {
    throw new Error("Registration not found");
  }

  const { registrations, byNumber: registrationNumberMap } = buildRegistrationNumberMaps(
    await ctx.db.query("registrations").take(1000)
  );

  const targetIds = new Set<string>();

  for (const submittedNumber of normalizedNumbers) {
    const target = registrationNumberMap.get(submittedNumber);
    if (target) {
      targetIds.add(String(target._id));
    }
  }

  if (!targetIds.size) return;

  for (const targetId of targetIds) {
    if (String(registration._id) === targetId) continue;

    const targetRegistration = registrations.find((candidate) => String(candidate._id) === targetId);
    if (!targetRegistration) continue;
    if (registration.gender === targetRegistration.gender) continue;

    try {
      await createApplicantInterestWithRules(ctx, {
        fromRegistrationId: registration._id,
        toRegistrationId: targetRegistration._id,
        source: "platform_submission",
        notes: `Submitted via profile update: ${normalizedNumbers.join(", ")}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        !message.startsWith("An open interest already exists") &&
        !message.startsWith("Applicant must have attended an event")
      ) {
        throw error;
      }
    }
  }
}

function hasCompletedProfile(args: Pick<
  Doc<"registrations">,
  | "ethnicity"
  | "imageStorageIds"
  | "prayerCommitment"
  | "hijabResponse"
  | "spouseRequirement1"
  | "spouseRequirement2"
  | "spouseRequirement3"
  | "shareableBio"
  | "photoSharingPermission"
>) {
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

function legacyLookingForText(args: {
  spouseRequirement1: string;
  spouseRequirement2: string;
  spouseRequirement3: string;
}) {
  return [args.spouseRequirement1, args.spouseRequirement2, args.spouseRequirement3]
    .map((requirement) => requirement.trim())
    .filter(Boolean)
    .join(", ");
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
    interestSubmissionNumbers: v.optional(v.array(v.number())),
    eventCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const profileCompleted = hasCompletedProfile(args);
    const event = args.eventCode ? await validatePublicEventRegistration(ctx, args.eventCode) : null;

    const emailCanonical = normalizeEmail(args.email);
    const phoneCanonical = normalizePhone(args.phone);
    const nameCanonical = normalizeName(args.name);
    const existingProfile = await findExistingParticipantProfile(ctx, args, Boolean(event));
    if (existingProfile && !event) {
      throw new Error("An applicant is already registered with this email.");
    }
    if (existingProfile && event) {
      await ctx.db.patch(existingProfile._id, {
        emailCanonical: normalizeEmail(existingProfile.email),
        phoneCanonical: normalizePhone(existingProfile.phone) || undefined,
        nameCanonical: normalizeName(existingProfile.name),
        stripeSessionId: args.stripeSessionId,
        paymentStatus: existingProfile.paymentStatus === "paid" ? "paid" : args.paymentStatus ?? "pending",
      });
      await createOrRestoreEventRegistration(ctx, { event, registration: existingProfile, now });
      return existingProfile._id;
    }

    const registrationId = await ctx.db.insert("registrations", {
      applicantNumber: await nextApplicantNumber(ctx),
      publicApplicantNumber: await nextPublicApplicantNumber(ctx),
      name: args.name.trim(),
      age: args.age,
      gender: args.gender,
      maritalStatus: args.maritalStatus,
      education: args.education,
      job: args.job,
      email: emailCanonical,
      emailCanonical,
      phone: args.phone.trim(),
      phoneCanonical: phoneCanonical || undefined,
      nameCanonical,
      describeYourself: args.describeYourself,
      lookingFor: args.lookingFor,
      backgroundCheck: args.backgroundCheck,
      stripeSessionId: args.stripeSessionId,
      paymentStatus: args.paymentStatus ?? "pending",
      status: "pending",
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
      interestSubmissionNumbers: normalizeInterestSubmissionNumbers(args.interestSubmissionNumbers),
    });

    if (event) {
      const registration = await ctx.db.get(registrationId);
      if (!registration) throw new Error("Registration not found after creation");
      await createOrRestoreEventRegistration(ctx, { event, registration, now });
    }

    return registrationId;
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
          imageStorageIds.map(async (storageId) => ({
            storageId,
            url: await ctx.storage.getUrl(storageId),
          }))
        );
        const images = imageUrls.filter((image): image is { storageId: typeof image.storageId; url: string } =>
          Boolean(image.url)
        );

        return {
          ...registration,
          imageUrls: images.map((image) => image.url),
          images,
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

    return {
      maleCount: nonRejected.filter((r) => r.gender === "male").length,
      femaleCount: nonRejected.filter((r) => r.gender === "female").length,
      maleLimit: 1000,
      femaleLimit: 1000,
    };
  },
});

// Compatibility for older deployed admin bundles. Original registration waitlist
// is retired, so old writes of "waitlisted" are normalized back to "pending".
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
    await ctx.db.patch(args.id, { status: args.status === "waitlisted" ? "pending" : args.status });
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
    interestSubmissionNumbers: v.optional(v.array(v.number())),
    applicantNotesToAdmin: v.optional(v.string()),
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

    const normalizedInterestSubmissionNumbers = normalizeInterestSubmissionNumbers(args.interestSubmissionNumbers);
    const shareableBio = args.shareableBio.trim();
    const lookingFor = legacyLookingForText(args);
    await ctx.db.patch(registration._id, {
      ethnicity: args.ethnicity.trim(),
      imageStorageIds: args.imageStorageIds,
      prayerCommitment: args.prayerCommitment,
      hijabResponse: args.hijabResponse,
      spouseRequirement1: args.spouseRequirement1.trim(),
      spouseRequirement2: args.spouseRequirement2.trim(),
      spouseRequirement3: args.spouseRequirement3.trim(),
      shareableBio,
      describeYourself: shareableBio,
      lookingFor,
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

    await syncSubmittedInterestNumbers(ctx, registration._id, normalizedInterestSubmissionNumbers);

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

    if (args.paymentStatus === "failed" && registration.paymentStatus === "paid") {
      return registration._id;
    }

    await ctx.db.patch(registration._id, {
      paymentStatus: args.paymentStatus,
      amountPaid: args.amountPaid,
    });

    return registration._id;
  },
});

export const getByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const trimmed = args.email.trim();
    if (!trimmed) return null;
    const lowercased = normalizeEmail(trimmed);
    const byCanonical = await ctx.db
      .query("registrations")
      .withIndex("by_emailCanonical", (q) => q.eq("emailCanonical", lowercased))
      .first();
    if (byCanonical) return byCanonical;
    const byTrimmed = await ctx.db
      .query("registrations")
      .withIndex("by_email", (q) => q.eq("email", trimmed))
      .first();
    if (byTrimmed) return byTrimmed;
    if (lowercased === trimmed) return null;
    return await ctx.db
      .query("registrations")
      .withIndex("by_email", (q) => q.eq("email", lowercased))
      .first();
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
  // The persisted high-water-mark in settings is intentionally left untouched
  // so the deleted applicant number can never be re-issued to a new registration.
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
    return args.id;
  },
});
