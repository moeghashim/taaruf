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
const eventStatus = v.union(
  v.literal("draft"),
  v.literal("scheduled"),
  v.literal("completed"),
  v.literal("cancelled")
);
const eventRegistrationStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("waitlisted"),
  v.literal("rejected"),
  v.literal("cancelled")
);
const eventAttendanceStatus = v.union(
  v.literal("not_checked_in"),
  v.literal("attended"),
  v.literal("no_show")
);
const eventEligibilityStatus = v.union(
  v.literal("approved_member"),
  v.literal("awaiting_background_check")
);
const eventRegistrationEmailKind = v.union(
  v.literal("approved"),
  v.literal("waitlisted"),
  v.literal("confirmation_request"),
  v.literal("cancelled"),
  v.literal("reminder")
);
const eventWaitlistStatus = v.union(
  v.literal("active"),
  v.literal("removed")
);

export default defineSchema({
  registrations: defineTable({
    applicantNumber: v.optional(v.number()),
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
      v.literal("rejected")
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
    .index("by_applicantNumber", ["applicantNumber"])
    .index("by_email", ["email"])
    .index("by_stripeSessionId", ["stripeSessionId"])
    .index("by_profileAccessToken", ["profileAccessToken"]),

  interests: defineTable({
    fromRegistrationId: v.id("registrations"),
    toRegistrationId: v.id("registrations"),
    eventId: v.id("events"),
    rank: v.optional(v.number()),
    source: interestSource,
    status: interestStatus,
    visibility: interestVisibility,
    adminStatus: v.optional(interestAdminStatus),
    notes: v.optional(v.string()),
    matchId: v.optional(v.id("matches")),
    inboundInterestNotificationSentAt: v.optional(v.number()),
    inboundInterestNotificationError: v.optional(v.string()),
    declineNotificationSentAt: v.optional(v.number()),
    declineNotificationError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_fromRegistrationId", ["fromRegistrationId"])
    .index("by_toRegistrationId", ["toRegistrationId"])
    .index("by_fromRegistrationId_and_status", ["fromRegistrationId", "status"])
    .index("by_fromRegistrationId_and_toRegistrationId", ["fromRegistrationId", "toRegistrationId"])
    .index("by_fromRegistrationId_and_toRegistrationId_and_eventId", ["fromRegistrationId", "toRegistrationId", "eventId"])
    .index("by_toRegistrationId_and_status", ["toRegistrationId", "status"])
    .index("by_status", ["status"])
    .index("by_eventId", ["eventId"])
    .index("by_matchId", ["matchId"]),

  events: defineTable({
    title: v.string(),
    eventCode: v.string(),
    eventMonth: v.string(),
    series: v.string(),
    description: v.optional(v.string()),
    location: v.string(),
    startsAt: v.number(),
    endsAt: v.number(),
    status: eventStatus,
    maleCapacity: v.number(),
    femaleCapacity: v.number(),
    registrationOpensAt: v.optional(v.number()),
    registrationClosesAt: v.optional(v.number()),
    interestSubmissionClosesAt: v.optional(v.number()),
    adminNotes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_startsAt", ["startsAt"])
    .index("by_series_and_eventMonth", ["series", "eventMonth"])
    .index("by_series_and_startsAt", ["series", "startsAt"])
    .index("by_eventCode", ["eventCode"]),

  eventRegistrations: defineTable({
    eventId: v.id("events"),
    registrationId: v.id("registrations"),
    gender: v.union(v.literal("male"), v.literal("female")),
    registrationStatus: eventRegistrationStatus,
    attendanceStatus: eventAttendanceStatus,
    eligibilityStatus: eventEligibilityStatus,
    confirmedAt: v.optional(v.number()),
    confirmationRequestedAt: v.optional(v.number()),
    confirmationExpiresAt: v.optional(v.number()),
    waitlistCarryoverFromEventId: v.optional(v.id("events")),
    approvedAt: v.optional(v.number()),
    rejectedAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    checkedInAt: v.optional(v.number()),
    noShowMarkedAt: v.optional(v.number()),
    registrationReceivedEmailSentAt: v.optional(v.number()),
    registrationReceivedEmailError: v.optional(v.string()),
    adminNotes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_registrationId", ["registrationId"])
    .index("by_registrationStatus", ["registrationStatus"])
    .index("by_eventId_and_registrationId", ["eventId", "registrationId"])
    .index("by_eventId_and_gender", ["eventId", "gender"])
    .index("by_eventId_and_registrationStatus", ["eventId", "registrationStatus"])
    .index("by_eventId_and_gender_and_registrationStatus", ["eventId", "gender", "registrationStatus"])
    .index("by_registrationId_and_attendanceStatus", ["registrationId", "attendanceStatus"]),

  eventWaitlistEntries: defineTable({
    eventId: v.id("events"),
    registrationId: v.id("registrations"),
    gender: v.union(v.literal("male"), v.literal("female")),
    status: eventWaitlistStatus,
    sourceEventId: v.optional(v.id("events")),
    sourceEventRegistrationId: v.optional(v.id("eventRegistrations")),
    removedAt: v.optional(v.number()),
    adminNotes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_registrationId", ["registrationId"])
    .index("by_eventId_and_registrationId", ["eventId", "registrationId"])
    .index("by_eventId_and_status", ["eventId", "status"])
    .index("by_eventId_and_gender_and_status", ["eventId", "gender", "status"])
    .index("by_status", ["status"])
    .index("by_registrationId_and_status", ["registrationId", "status"]),

  eventRegistrationEmails: defineTable({
    eventRegistrationId: v.id("eventRegistrations"),
    eventId: v.id("events"),
    registrationId: v.id("registrations"),
    kind: eventRegistrationEmailKind,
    sentAt: v.optional(v.number()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_eventRegistrationId", ["eventRegistrationId"])
    .index("by_eventRegistrationId_and_kind", ["eventRegistrationId", "kind"])
    .index("by_eventId_and_kind", ["eventId", "kind"]),

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
    contactSharedNotificationSentAt: v.optional(v.number()),
    contactSharedNotificationError: v.optional(v.string()),
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
    finalApprovalNotificationSentAt: v.optional(v.number()),
    finalApprovalNotificationError: v.optional(v.string()),
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
