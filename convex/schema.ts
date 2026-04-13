import { defineSchema, defineTable } from "convex/server";
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
const interestType = v.union(
  v.literal("admin_suggested"),
  v.literal("man_interested"),
  v.literal("woman_interested"),
  v.literal("mutual_interest")
);
const matchStatus = v.union(
  v.literal("new"),
  v.literal("reviewing"),
  v.literal("contact_shared"),
  v.literal("declined"),
  v.literal("paused"),
  v.literal("closed")
);
const shareStatus = v.union(
  v.literal("drafted"),
  v.literal("shared"),
  v.literal("viewed"),
  v.literal("interested"),
  v.literal("declined"),
  v.literal("follow_up_needed"),
  v.literal("closed")
);

export default defineSchema({
  registrations: defineTable({
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
    paymentStatus: v.optional(
      v.union(v.literal("pending"), v.literal("paid"), v.literal("failed"))
    ),
    stripeSessionId: v.optional(v.string()),
    amountPaid: v.optional(v.number()),
    confirmationEmailSent: v.optional(v.boolean()),
    adminNotes: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("waitlisted")
    ),
    searchStatus: v.optional(searchStatus),
    searchStatusNote: v.optional(v.string()),
    createdAt: v.number(),
    profileAccessToken: v.optional(v.string()),
    profileCompletionStatus: v.optional(
      v.union(v.literal("not_started"), v.literal("in_progress"), v.literal("completed"))
    ),
    profileCompletedAt: v.optional(v.number()),
    profileLastUpdatedAt: v.optional(v.number()),
    profileUpdateRequestedAt: v.optional(v.number()),
    profileUpdateEmailSent: v.optional(v.boolean()),
    profileUpdateEmailSentAt: v.optional(v.number()),
    profileUpdateEmailError: v.optional(v.string()),
    ethnicity: v.optional(v.string()),
    imageStorageIds: v.optional(v.array(v.id("_storage"))),
    prayerCommitment: v.optional(prayerCommitment),
    hijabResponse: v.optional(yesNoOpen),
    spouseRequirement1: v.optional(v.string()),
    spouseRequirement2: v.optional(v.string()),
    spouseRequirement3: v.optional(v.string()),
    shareableBio: v.optional(v.string()),
    photoSharingPermission: v.optional(photoSharingPermission),
  })
    .index("by_gender", ["gender"])
    .index("by_status", ["status"])
    .index("by_stripeSessionId", ["stripeSessionId"])
    .index("by_profileAccessToken", ["profileAccessToken"]),

  matches: defineTable({
    maleRegistrationId: v.id("registrations"),
    femaleRegistrationId: v.id("registrations"),
    interestType,
    status: matchStatus,
    adminNotes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_maleRegistrationId", ["maleRegistrationId"])
    .index("by_femaleRegistrationId", ["femaleRegistrationId"])
    .index("by_status", ["status"]),

  profileShares: defineTable({
    ownerRegistrationId: v.id("registrations"),
    recipientRegistrationId: v.id("registrations"),
    includeImages: v.boolean(),
    status: shareStatus,
    adminNotes: v.optional(v.string()),
    shareToken: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    viewedAt: v.optional(v.number()),
  })
    .index("by_ownerRegistrationId", ["ownerRegistrationId"])
    .index("by_recipientRegistrationId", ["recipientRegistrationId"])
    .index("by_shareToken", ["shareToken"])
    .index("by_status", ["status"]),

  settings: defineTable({
    key: v.string(),
    value: v.string(),
  }).index("by_key", ["key"]),
});
