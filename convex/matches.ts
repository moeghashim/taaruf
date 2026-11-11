import { isManualMatchDraft } from "../src/lib/manual-match-draft";
import { paginationOptsValidator } from "convex/server";
import { sessionAllowed } from "./capabilitySecurity";
import { assertMatchInterest, releasePairContacts, setPairPaused, assertParticipantsAvailable } from "./contactGate";
import { requireAdmin, withoutCapabilities } from "./adminAuthorization";
import { assertNotArchived, assertMatchingParticipants } from "./interestRules";
import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  demoteOpenInterestsInvolvingRegistration,
  promoteOldestQueuedForRegistration,
} from "./interestRules";

const matchStatus = v.union(
  v.literal("new"),
  v.literal("reviewing"),
  v.literal("contact_shared"),
  v.literal("declined"),
  v.literal("paused"),
  v.literal("closed")
);

const releasingStatuses = new Set(["closed", "declined", "paused"]);
const interestFlowStatuses = [
  "private_documented",
  "awaiting_inbound_response",
  "kept_open",
  "bio_review",
  "awaiting_final_approvals",
  "awaiting_photo_request",
  "awaiting_photo_response",
  "photos_visible",
  "contact_shared",
  "declined",
  "closed",
] as const;

/** Creates an admin-only suggestion. Consent and sharing remain separate. */
export const create = mutation({
  args: { adminSecret: v.optional(v.string()), maleRegistrationId: v.id("registrations"), femaleRegistrationId: v.id("registrations"), adminNotes: v.optional(v.string()) },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    if (!process.env.ATTENDANCE_ADMIN_SECRET || args.adminSecret !== process.env.ATTENDANCE_ADMIN_SECRET) throw new Error("Unauthorized");
    if (args.maleRegistrationId === args.femaleRegistrationId) throw new ConvexError("Select two different applicants.");
    const male = await ctx.db.get(args.maleRegistrationId);
    const female = await ctx.db.get(args.femaleRegistrationId);
    if (!male || !female) throw new ConvexError("An applicant no longer exists. Refresh and select again.");
    if (male.gender !== "male" || female.gender !== "female") throw new ConvexError("Select one male and one female applicant.");
    for (const person of [male, female]) {
      assertNotArchived(person);
      if (person.status !== "approved" || person.profileCompletionStatus !== "completed" || (person.searchStatus ?? "active") !== "active") throw new ConvexError("Both applicants must be approved, have complete profiles, and be actively searching.");
      if (person.activeMatchId) throw new ConvexError("An applicant already has an active match. Review it before creating another.");
    }
    if ((args.adminNotes?.length ?? 0) > 2000) throw new ConvexError("Admin notes must be 2,000 characters or fewer.");
    for await (const match of ctx.db.query("matches").withIndex("by_maleRegistrationId", q => q.eq("maleRegistrationId", male._id))) {
      if (match.femaleRegistrationId === female._id && !["closed", "declined"].includes(match.status)) throw new ConvexError("An open match already exists for this pair. Open it in the workbench.");
    }
    for (const [from, to] of [[male._id, female._id], [female._id, male._id]]) {
      for await (const interest of ctx.db.query("interests").withIndex("by_fromRegistrationId", q => q.eq("fromRegistrationId", from))) {
        if (interest.toRegistrationId === to && !interest.testReset && !["closed", "declined", "withdrawn"].includes(interest.status)) throw new ConvexError("Use participant final approvals for an interest-backed pair; manual creation cannot substitute consent.");
      }
    }
    await assertParticipantsAvailable(ctx, male._id, female._id);
    const now = Date.now();
    return await ctx.db.insert("matches", { maleRegistrationId: male._id, femaleRegistrationId: female._id, status: "new", interestType: "admin_suggested", initiatedBy: "admin_recommendation", adminNotes: args.adminNotes?.trim() || undefined, createdAt: now, updatedAt: now });
  },
});

export const getById = query({
  args: { adminSecret: v.optional(v.string()),
    id: v.id("matches"),
  },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    const match = await ctx.db.get(args.id);
    return match?.testResetAt !== undefined ? null : match;
  },
});

export const getAll = query({
  args: { adminSecret: v.optional(v.string()),},
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    const matches = await ctx.db.query("matches").take(1000);

    return withoutCapabilities(await Promise.all(
      matches.filter(match => match.testResetAt === undefined).map(async (match) => {
        const maleRegistration = await ctx.db.get(match.maleRegistrationId);
        const femaleRegistration = await ctx.db.get(match.femaleRegistrationId);
        const interest = match.interestId ? await ctx.db.get(match.interestId) : null;

        return {
          ...match,
          maleRegistration,
          femaleRegistration,
          interest,
        };
      })
    ));
  },
});

export const resetPair = mutation({
  args: { adminSecret: v.optional(v.string()),
    registrationAId: v.id("registrations"),
    registrationBId: v.id("registrations"),
  },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    const registrations = await Promise.all([
      ctx.db.get(args.registrationAId),
      ctx.db.get(args.registrationBId),
    ]);

    if (!registrations[0] || !registrations[1]) {
      throw new Error("Registration not found");
    }

    assertNotArchived(registrations[0]);
    assertNotArchived(registrations[1]);
    const pairIds = new Set([args.registrationAId, args.registrationBId]);
    const now = Date.now();

    const outboundA = await ctx.db
      .query("interests")
      .withIndex("by_fromRegistrationId", (q) => q.eq("fromRegistrationId", args.registrationAId))
      .collect();
    const outboundB = await ctx.db
      .query("interests")
      .withIndex("by_fromRegistrationId", (q) => q.eq("fromRegistrationId", args.registrationBId))
      .collect();

    if ([...outboundA, ...outboundB].some(i => pairIds.has(i.toRegistrationId) && i.matchId && i.testReset)) throw new Error("Reset pair audit is read-only");
    const interestsToReset = [...outboundA, ...outboundB].filter(
      (interest) => pairIds.has(interest.fromRegistrationId) && pairIds.has(interest.toRegistrationId)
    );

    for (const interest of interestsToReset) {
      if (interest.testReset) continue;
      await ctx.db.patch(interest._id, {
        status: "closed",
        adminStatus: "declined",
        matchId: undefined,
        updatedAt: now,
      });

      const flow = await ctx.db
        .query("interestFlows")
        .withIndex("by_interestId", (q) => q.eq("interestId", interest._id))
        .unique();
      if (flow) {
        await ctx.db.patch(flow._id, {
          flowStatus: "closed",
          contactSharedAt: undefined,
          closedReason: "admin_reset_pair",
          updatedAt: now,
        });
        await ctx.db.insert("interestFlowEvents", {
          interestFlowId: flow._id,
          interestId: interest._id,
          actor: "system",
          eventType: "pair_reset",
          message: "Connection removed by admin reset.",
          createdAt: now,
        });
      }
    }

    const matchesByMaleA = await ctx.db
      .query("matches")
      .withIndex("by_maleRegistrationId", (q) => q.eq("maleRegistrationId", args.registrationAId))
      .collect();
    const matchesByMaleB = await ctx.db
      .query("matches")
      .withIndex("by_maleRegistrationId", (q) => q.eq("maleRegistrationId", args.registrationBId))
      .collect();
    const matchesByFemaleA = await ctx.db
      .query("matches")
      .withIndex("by_femaleRegistrationId", (q) => q.eq("femaleRegistrationId", args.registrationAId))
      .collect();
    const matchesByFemaleB = await ctx.db
      .query("matches")
      .withIndex("by_femaleRegistrationId", (q) => q.eq("femaleRegistrationId", args.registrationBId))
      .collect();

    const matchesToDelete = [...matchesByMaleA, ...matchesByMaleB, ...matchesByFemaleA, ...matchesByFemaleB].filter(
      (match, index, all) =>
        pairIds.has(match.maleRegistrationId) &&
        pairIds.has(match.femaleRegistrationId) &&
        all.findIndex((candidate) => candidate._id === match._id) === index
    );

    for (const match of matchesToDelete) {
      if (match.testResetAt !== undefined) throw new Error("Reset test match is read-only");
      if (!match.interestId && (match.interestType === "admin_suggested" || match.initiatedBy === "admin_recommendation") && (match.matchmakerPresentedAt !== undefined || match.status === "contact_shared" || match.contactGate === "contacts_released" || match.adminReleasedAt !== undefined || match.contactSharedNotificationSentAt !== undefined)) throw new Error("Presented matchmaker history must be retained; close the match instead");
      await ctx.db.delete(match._id);
    }

    await ctx.db.patch(args.registrationAId, {
      activeMatchId: undefined,
    });
    await ctx.db.patch(args.registrationBId, {
      activeMatchId: undefined,
    });
    await promoteOldestQueuedForRegistration(ctx, args.registrationAId);
    await promoteOldestQueuedForRegistration(ctx, args.registrationBId);

    return {
      clearedInterestIds: interestsToReset.map((interest) => interest._id),
      deletedMatchIds: matchesToDelete.map((match) => match._id),
    };
  },
});

export const deletePairConnection = mutation({
  args: { adminSecret: v.optional(v.string()),
    registrationAId: v.id("registrations"),
    registrationBId: v.id("registrations"),
  },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    const registrations = await Promise.all([
      ctx.db.get(args.registrationAId),
      ctx.db.get(args.registrationBId),
    ]);

    if (!registrations[0] || !registrations[1]) {
      throw new Error("Registration not found");
    }

    assertNotArchived(registrations[0]);
    assertNotArchived(registrations[1]);
    const pairIds = new Set([args.registrationAId, args.registrationBId]);

    const outboundA = await ctx.db
      .query("interests")
      .withIndex("by_fromRegistrationId", (q) => q.eq("fromRegistrationId", args.registrationAId))
      .collect();
    const outboundB = await ctx.db
      .query("interests")
      .withIndex("by_fromRegistrationId", (q) => q.eq("fromRegistrationId", args.registrationBId))
      .collect();

    const interestsToDelete = [...outboundA, ...outboundB].filter(
      (interest) => pairIds.has(interest.fromRegistrationId) && pairIds.has(interest.toRegistrationId)
    );

    if (interestsToDelete.some(interest => interest.source === "platform_submission" || interest.testReset)) throw new Error("Submitted interests must be retained; use explicit test reset after review");

    const flowCandidates: Doc<"interestFlows">[] = [];
    for (const status of interestFlowStatuses) {
      const flowsFromA = await ctx.db
        .query("interestFlows")
        .withIndex("by_fromRegistrationId_and_flowStatus", (q) =>
          q.eq("fromRegistrationId", args.registrationAId).eq("flowStatus", status)
        )
        .collect();
      const flowsFromB = await ctx.db
        .query("interestFlows")
        .withIndex("by_fromRegistrationId_and_flowStatus", (q) =>
          q.eq("fromRegistrationId", args.registrationBId).eq("flowStatus", status)
        )
        .collect();
      flowCandidates.push(...flowsFromA, ...flowsFromB);
    }

    for (const interest of interestsToDelete) {
      const flow = await ctx.db
        .query("interestFlows")
        .withIndex("by_interestId", (q) => q.eq("interestId", interest._id))
        .unique();
      if (flow) {
        flowCandidates.push(flow);
      }
    }

    const flowsToDelete = flowCandidates.filter(
      (flow, index, all) =>
        pairIds.has(flow.fromRegistrationId) &&
        pairIds.has(flow.toRegistrationId) &&
        all.findIndex((candidate) => candidate._id === flow._id) === index
    );

    const deletedEventIds = new Set<string>();
    for (const flow of flowsToDelete) {
      const events = await ctx.db
        .query("interestFlowEvents")
        .withIndex("by_interestFlowId_and_createdAt", (q) => q.eq("interestFlowId", flow._id))
        .collect();
      for (const event of events) {
        if (!deletedEventIds.has(event._id)) {
          await ctx.db.delete(event._id);
          deletedEventIds.add(event._id);
        }
      }
      await ctx.db.delete(flow._id);
    }

    for (const interest of interestsToDelete) {
      const events = await ctx.db
        .query("interestFlowEvents")
        .withIndex("by_interestId", (q) => q.eq("interestId", interest._id))
        .collect();
      for (const event of events) {
        if (!deletedEventIds.has(event._id)) {
          await ctx.db.delete(event._id);
          deletedEventIds.add(event._id);
        }
      }

      await ctx.db.delete(interest._id);
    }

    const matchesByMaleA = await ctx.db
      .query("matches")
      .withIndex("by_maleRegistrationId", (q) => q.eq("maleRegistrationId", args.registrationAId))
      .collect();
    const matchesByMaleB = await ctx.db
      .query("matches")
      .withIndex("by_maleRegistrationId", (q) => q.eq("maleRegistrationId", args.registrationBId))
      .collect();
    const matchesByFemaleA = await ctx.db
      .query("matches")
      .withIndex("by_femaleRegistrationId", (q) => q.eq("femaleRegistrationId", args.registrationAId))
      .collect();
    const matchesByFemaleB = await ctx.db
      .query("matches")
      .withIndex("by_femaleRegistrationId", (q) => q.eq("femaleRegistrationId", args.registrationBId))
      .collect();

    const matchesToDelete = [...matchesByMaleA, ...matchesByMaleB, ...matchesByFemaleA, ...matchesByFemaleB].filter(
      (match, index, all) =>
        pairIds.has(match.maleRegistrationId) &&
        pairIds.has(match.femaleRegistrationId) &&
        all.findIndex((candidate) => candidate._id === match._id) === index
    );
    const deletedMatchIds = new Set(matchesToDelete.map((match) => match._id));

    for (const match of matchesToDelete) {
      if (match.testResetAt !== undefined) throw new Error("Reset test match is read-only");
      if (!match.interestId && (match.interestType === "admin_suggested" || match.initiatedBy === "admin_recommendation") && (match.matchmakerPresentedAt !== undefined || match.status === "contact_shared" || match.contactGate === "contacts_released" || match.adminReleasedAt !== undefined || match.contactSharedNotificationSentAt !== undefined)) throw new Error("Presented matchmaker history must be retained; close the match instead");
      await ctx.db.delete(match._id);
    }

    const sharesByOwnerA = await ctx.db
      .query("profileShares")
      .withIndex("by_ownerRegistrationId", (q) => q.eq("ownerRegistrationId", args.registrationAId))
      .collect();
    const sharesByOwnerB = await ctx.db
      .query("profileShares")
      .withIndex("by_ownerRegistrationId", (q) => q.eq("ownerRegistrationId", args.registrationBId))
      .collect();
    const profileSharesToDelete = [...sharesByOwnerA, ...sharesByOwnerB].filter(
      (share, index, all) =>
        pairIds.has(share.ownerRegistrationId) &&
        pairIds.has(share.recipientRegistrationId) &&
        all.findIndex((candidate) => candidate._id === share._id) === index
    );

    for (const share of profileSharesToDelete) {
      await ctx.db.delete(share._id);
    }

    if (registrations[0].activeMatchId && deletedMatchIds.has(registrations[0].activeMatchId)) {
      await ctx.db.patch(args.registrationAId, { activeMatchId: undefined });
    }
    if (registrations[1].activeMatchId && deletedMatchIds.has(registrations[1].activeMatchId)) {
      await ctx.db.patch(args.registrationBId, { activeMatchId: undefined });
    }

    await promoteOldestQueuedForRegistration(ctx, args.registrationAId);
    await promoteOldestQueuedForRegistration(ctx, args.registrationBId);

    return {
      deletedInterestIds: interestsToDelete.map((interest) => interest._id),
      deletedInterestFlowIds: flowsToDelete.map((flow) => flow._id),
      deletedMatchIds: matchesToDelete.map((match) => match._id),
      deletedProfileShareIds: profileSharesToDelete.map((share) => share._id),
    };
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("matches"),
    status: matchStatus,
    adminNotes: v.optional(v.string()),
    adminSecret: v.optional(v.string()),
    closedReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    const match = await ctx.db.get(args.id);
    if (!match) {
      throw new Error("Match not found");
    }

    if (match.testResetAt !== undefined) throw new Error("Reset test match is read-only");
    if (!["closed", "declined"].includes(args.status)) {
      await assertMatchingParticipants(ctx, match.maleRegistrationId, match.femaleRegistrationId);
    }

    if (args.status === match.status && args.adminNotes !== undefined) {
      await ctx.db.patch(match._id, { adminNotes: args.adminNotes, updatedAt: Date.now() });
      return match._id;
    }

    if (args.status === "paused") return await setPairPaused(ctx, match, true);
    if (args.status === "contact_shared") {
      await releasePairContacts(ctx, match);
      for (const id of [match.maleRegistrationId, match.femaleRegistrationId]) await demoteOpenInterestsInvolvingRegistration(ctx, id, match._id);
      return args.id;
    }
    if (args.status !== match.status && !["closed", "declined"].includes(args.status)) throw new Error("Use Resume for a paused match");
    if (["closed", "declined"].includes(match.status) && args.status !== match.status) throw new Error("Match is not active");
    const previousStatus = match.status;
    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: args.status,
      ...(previousStatus === "contact_shared" && !match.interestId ? { contactGate: "contacts_released" as const } : {}),
      adminNotes: args.adminNotes ?? match.adminNotes,
      closedReason: args.closedReason ?? match.closedReason,
      updatedAt: now,
    });

    if (previousStatus === "contact_shared" && releasingStatuses.has(args.status)) {
      const maleRegistration = await ctx.db.get(match.maleRegistrationId);
      const femaleRegistration = await ctx.db.get(match.femaleRegistrationId);

      if (maleRegistration?.activeMatchId === args.id) {
        await ctx.db.patch(match.maleRegistrationId, {
          activeMatchId: undefined,
        });
      }
      if (femaleRegistration?.activeMatchId === args.id) {
        await ctx.db.patch(match.femaleRegistrationId, {
          activeMatchId: undefined,
        });
      }

      await promoteOldestQueuedForRegistration(ctx, match.maleRegistrationId);
      await promoteOldestQueuedForRegistration(ctx, match.femaleRegistrationId);
    }

    if (["closed", "declined"].includes(args.status) && match.interestId) {
      const rows = await ctx.db.query("interests").withIndex("by_matchId", q => q.eq("matchId", match._id)).collect();
      for (const row of rows) {
        assertMatchInterest(match, row);
        await ctx.db.patch(row._id, { status: args.status as "closed" | "declined", updatedAt: now });
        const flow = await ctx.db.query("interestFlows").withIndex("by_interestId", q => q.eq("interestId", row._id)).unique();
        if (flow) await ctx.db.patch(flow._id, { flowStatus: args.status as "closed" | "declined", closedReason: args.closedReason ?? `match_${args.status}`, updatedAt: now });
      }
    }

    return args.id;
  },
});

export const verifyActiveMatchInvariant = query({
  args: { adminSecret: v.optional(v.string()),},
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    const issues: Array<{
      kind: string;
      registrationId?: string;
      matchId?: string;
      message: string;
    }> = [];
    const registrations = await ctx.db.query("registrations").take(1000);
    const contactSharedMatches = await ctx.db
      .query("matches")
      .withIndex("by_status", (q) => q.eq("status", "contact_shared"))
      .take(1000);

    for (const registration of registrations) {
      if (!registration.activeMatchId) continue;
      const match = await ctx.db.get(registration.activeMatchId);
      if (!match) {
        issues.push({
          kind: "registration_points_to_missing_match",
          registrationId: registration._id,
          matchId: registration.activeMatchId,
          message: "Registration points to a missing active match",
        });
        continue;
      }
      if (match.status !== "contact_shared") {
        issues.push({
          kind: "registration_points_to_inactive_match",
          registrationId: registration._id,
          matchId: match._id,
          message: "Registration points to a match that is not contact_shared",
        });
      }
    }

    for (const match of contactSharedMatches) {
      const male = await ctx.db.get(match.maleRegistrationId);
      const female = await ctx.db.get(match.femaleRegistrationId);
      if (male?.activeMatchId !== match._id) {
        issues.push({
          kind: "contact_shared_missing_male_pointer",
          registrationId: match.maleRegistrationId,
          matchId: match._id,
          message: "Contact-shared match is missing the male registration pointer",
        });
      }
      if (female?.activeMatchId !== match._id) {
        issues.push({
          kind: "contact_shared_missing_female_pointer",
          registrationId: match.femaleRegistrationId,
          matchId: match._id,
          message: "Contact-shared match is missing the female registration pointer",
        });
      }
    }

    return {
      ok: issues.length === 0,
      issues,
    };
  },
});

export const markNotificationSent = mutation({
  args: { adminSecret: v.optional(v.string()),
    id: v.id("matches"),
    sent: v.boolean(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    if ((await ctx.db.get(args.id))?.testResetAt !== undefined) throw new Error("Reset test match is read-only");
    await ctx.db.patch(args.id, {
      matchNotificationSentAt: args.sent ? Date.now() : undefined,
      matchNotificationError: args.error,
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

export const markContactSharedNotificationSent = mutation({
  args: { adminSecret: v.optional(v.string()),
    id: v.id("matches"),
    sent: v.boolean(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    const match = await ctx.db.get(args.id);
    if (match?.testResetAt !== undefined) throw new Error("Reset test match is read-only");
    if (!match || (match.status !== "contact_shared" && match.contactGate !== "contacts_released" && match.adminReleasedAt === undefined)) throw new Error("Contacts must be released before recording notification");
    await ctx.db.patch(args.id, {
      contactSharedNotificationSentAt: args.sent ? Date.now() : undefined,
      contactSharedNotificationError: args.error,
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

export const resume = mutation({
  args: { adminSecret: v.optional(v.string()), id: v.id("matches") },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    const match = await ctx.db.get(args.id);
    if (!match) throw new Error("Match unavailable");
    await assertMatchingParticipants(ctx, match.maleRegistrationId, match.femaleRegistrationId);
    return await setPairPaused(ctx, match, false);
  },
});

export const setPausedForApplicant = mutation({
  args: { sessionHash: v.string(), interestId: v.id("interests"), paused: v.boolean() },
  handler: async (ctx, args) => {
    const session = await ctx.db.query("applicantSessions").withIndex("by_sessionHash", q => q.eq("sessionHash", args.sessionHash)).unique();
    if (!session || !(await sessionAllowed(ctx, session))) throw new Error("Unauthorized");
    const person = await ctx.db.get(session.registrationId);
    const interest = await ctx.db.get(args.interestId);
    if (!person || person.status !== "approved" || !interest || interest.testReset || ![interest.fromRegistrationId, interest.toRegistrationId].includes(person._id) || ["closed", "declined", "withdrawn"].includes(interest.status)) throw new Error("Unauthorized");
    const match = interest.matchId ? await ctx.db.get(interest.matchId) : null;
    if (!match) throw new Error("Match unavailable");
    assertMatchInterest(match, interest);
    await assertMatchingParticipants(ctx, match.maleRegistrationId, match.femaleRegistrationId);
    return await setPairPaused(ctx, match, args.paused, person._id);
  },
});

export const workbenchPage = query({
  args: { adminSecret: v.optional(v.string()), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    const result = await ctx.db.query("matches").paginate({ ...args.paginationOpts, numItems: Math.min(100, args.paginationOpts.numItems) });
    const matches = result.page;

    return { ...result, page: withoutCapabilities(await Promise.all(
      matches.filter(match => match.testResetAt === undefined).map(async (match) => {
        const maleRegistration = await ctx.db.get(match.maleRegistrationId);
        const femaleRegistration = await ctx.db.get(match.femaleRegistrationId);
        const interest = match.interestId ? await ctx.db.get(match.interestId) : null;

        return {
          ...match,
          maleRegistration,
          femaleRegistration,
          interest,
        };
      })
    )) };
  },
});

/** Server-side candidate pool; history queries deliberately retain archived rows. */
export const getCandidates = query({
  args: { adminSecret: v.string() },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    const rows = await ctx.db.query("registrations").withIndex("by_status", q => q.eq("status", "approved")).take(1000);
    return rows.filter(person => person.archivedAt === undefined && person.profileCompletionStatus === "completed" && (person.searchStatus ?? "active") === "active" && !person.activeMatchId)
      .map(({ _id, name, gender, publicApplicantNumber }) => ({ _id, name, gender, publicApplicantNumber }));
  },
});

/** Revalidate immediately before external delivery. This cannot revoke an in-flight provider call. */
export const assertNotificationEligible = mutation({
  args: { adminSecret: v.string(), id: v.id("matches") },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    const match = await ctx.db.get(args.id);
    if (!match || match.testResetAt !== undefined || isManualMatchDraft(match) || ["closed", "declined", "paused"].includes(match.status)) throw new Error("Match is not active");
    await assertMatchingParticipants(ctx, match.maleRegistrationId, match.femaleRegistrationId);
    return true;
  },
});
