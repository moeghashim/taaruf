import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireEventAdmin } from "./eventCapacity";
import { assertNotArchived } from "./archiveRules";
import { requireEventMessagingEligibility } from "./eventMessagingEligibility";
import { enrollmentForEvent } from "./eventEnrollmentIdentity";

/** Layla5291: single existing enrollment exception, never a global guard relaxation. */
export const forceNovember48 = mutation({
  args: { adminSecret: v.string(), eventId: v.id("events"), registrationId: v.id("registrations"), confirmClosedRegistrationOverride: v.literal(true), confirmCapacityOverride: v.literal(true) },
  handler: async (ctx, args) => {
    requireEventAdmin(args.adminSecret);
    const event = await ctx.db.get(args.eventId), profile = await ctx.db.get(args.registrationId);
    if (!event || event.eventCode !== "nov26" || event.startsAt !== 1794681900000) throw new Error("Wrong event");
    if (!profile || profile.publicApplicantNumber !== 48) throw new Error("Only public applicant48 is authorized");
    assertNotArchived(profile);
    requireEventMessagingEligibility(profile);
    if (profile.status !== "approved" || profile.profileCompletionStatus !== "completed") throw new Error("Approved complete profile required");
    const now = Date.now();
    if (event.status !== "scheduled" || event.startsAt <= now || !event.registrationClosesAt || event.registrationClosesAt >= now) throw new Error("Future scheduled closed-registration event required");
    const row = await enrollmentForEvent(ctx, event._id, profile._id);
    if (!row || row.gender !== profile.gender) throw new Error("Current matching enrollment required");
    if (row.confirmationStatus !== "confirmed") throw new Error("Existing confirmation required; this operation cannot confirm attendance");
    if (row.registrationStatus === "approved") return { changed: false, eventRegistrationId: row._id };
    if (row.registrationStatus !== "waitlisted") throw new Error("Only existing waitlisted enrollment may be force-approved");
    // Preserve original waitlist timestamp as history. Approved status removes it from the active queue.
    await ctx.db.patch(row._id, {
      registrationStatus: "approved", approvedAt: now, updatedAt: now,
      adminNotes: [row.adminNotes, "Layla5291 explicitly authorized admin force-approval public48 / Nov14 despite capacity and closed registration. Existing confirmation preserved; no capacity edit, queue processing or email."].filter(Boolean).join("\n"),
    });
    return { changed: true, eventRegistrationId: row._id };
  },
});
