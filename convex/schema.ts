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
const interestFlowStatus = v.union(
  v.literal("private_documented"),
  v.literal("awaiting_inbound_response"),
  v.literal("kept_open"),
  v.literal("bio_review"),
  v.literal("awaiting_final_approvals"),
  v.literal("awaiting_photo_request"),
  v.literal("awaiting_photo_response"),
  v.literal("photos_visible"),
  v.literal("contact_shared"),
  v.literal("declined"),
  v.literal("closed")
);
const interestDecision = v.union(
  v.literal("pending"),
  v.literal("accepted"),
  v.literal("declined"),
  v.literal("kept_open")
);
const approvalDecision = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("declined")
);
const photoDecision = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("declined")
);
const interestFlowEventActor = v.union(
  v.literal("applicant"),
  v.literal("admin"),
  v.literal("system")
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
    interestSubmission: v.optional(v.string()),
    interestSubmissionNumbers: v.optional(v.array(v.number())),
    applicantNotesToAdmin: v.optional(v.string()),
    activeMatchId: v.optional(v.id("matches")),
  })
    .index("by_gender", ["gender"])
    .index("by_status", ["status"])
    .index("by_email", ["email"])
    .index("by_stripeSessionId", ["stripeSessionId"])
    .index("by_profileAccessToken", ["profileAccessToken"]),

  interests: defineTable({
    fromRegistrationId: v.id("registrations"),
    toRegistrationId: v.id("registrations"),
    rank: v.optional(v.number()),
    source: interestSource,
    status: interestStatus,
    visibility: interestVisibility,
    adminStatus: v.optional(interestAdminStatus),
    notes: v.optional(v.string()),
    matchId: v.optional(v.id("matches")),
    declineNotificationSentAt: v.optional(v.number()),
    declineNotificationError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_fromRegistrationId", ["fromRegistrationId"])
    .index("by_toRegistrationId", ["toRegistrationId"])
    .index("by_fromRegistrationId_and_status", ["fromRegistrationId", "status"])
    .index("by_fromRegistrationId_and_toRegistrationId", ["fromRegistrationId", "toRegistrationId"])
    .index("by_toRegistrationId_and_status", ["toRegistrationId", "status"])
    .index("by_status", ["status"])
    .index("by_matchId", ["matchId"]),

  matches: defineTable({
    maleRegistrationId: v.id("registrations"),
    femaleRegistrationId: v.id("registrations"),
    interestType,
    status: matchStatus,
    adminNotes: v.optional(v.string()),
    interestId: v.optional(v.id("interests")),
    initiatedBy: v.optional(v.union(v.literal("admin_recommendation"), v.literal("interest_signal"))),
    followUpNeeded: v.optional(v.boolean()),
    followUpAt: v.optional(v.number()),
    closedReason: v.optional(v.string()),
    matchNotificationSentAt: v.optional(v.number()),
    matchNotificationError: v.optional(v.string()),
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
    interestId: v.optional(v.id("interests")),
    matchId: v.optional(v.id("matches")),
    sentAt: v.optional(v.number()),
    respondedAt: v.optional(v.number()),
    responseNote: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    viewedAt: v.optional(v.number()),
  })
    .index("by_ownerRegistrationId", ["ownerRegistrationId"])
    .index("by_recipientRegistrationId", ["recipientRegistrationId"])
    .index("by_shareToken", ["shareToken"])
    .index("by_status", ["status"]),

  applicantLoginTokens: defineTable({
    registrationId: v.id("registrations"),
    tokenHash: v.string(),
    expiresAt: v.number(),
    consumedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_registrationId", ["registrationId"]),

  applicantSessions: defineTable({
    registrationId: v.id("registrations"),
    sessionHash: v.string(),
    expiresAt: v.number(),
    revokedAt: v.optional(v.number()),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
  })
    .index("by_sessionHash", ["sessionHash"])
    .index("by_registrationId", ["registrationId"]),

  interestFlows: defineTable({
    interestId: v.id("interests"),
    fromRegistrationId: v.id("registrations"),
    toRegistrationId: v.id("registrations"),
    flowStatus: interestFlowStatus,
    recipientDecision: interestDecision,
    requesterFinalApproval: approvalDecision,
    recipientFinalApproval: approvalDecision,
    photoDecision: photoDecision,
    photoRequestedByRegistrationId: v.optional(v.id("registrations")),
    bioVisibleAt: v.optional(v.number()),
    requesterFinalApprovalAt: v.optional(v.number()),
    recipientFinalApprovalAt: v.optional(v.number()),
    photoRequestedAt: v.optional(v.number()),
    photoDecisionAt: v.optional(v.number()),
    photosVisibleAt: v.optional(v.number()),
    contactSharedAt: v.optional(v.number()),
    keepOpenExpiresAt: v.optional(v.number()),
    closedReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_interestId", ["interestId"])
    .index("by_fromRegistrationId_and_flowStatus", ["fromRegistrationId", "flowStatus"])
    .index("by_toRegistrationId_and_flowStatus", ["toRegistrationId", "flowStatus"])
    .index("by_keepOpenExpiresAt", ["keepOpenExpiresAt"]),

  interestFlowEvents: defineTable({
    interestFlowId: v.id("interestFlows"),
    interestId: v.id("interests"),
    actor: interestFlowEventActor,
    actorRegistrationId: v.optional(v.id("registrations")),
    eventType: v.string(),
    message: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_interestFlowId_and_createdAt", ["interestFlowId", "createdAt"])
    .index("by_interestId", ["interestId"]),

  settings: defineTable({
    key: v.string(),
    value: v.string(),
  }).index("by_key", ["key"]),
});
