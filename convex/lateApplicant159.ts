import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireEventAdmin, registrationStatusForCapacity } from "./eventCapacity";
import { assertNotArchived } from "./archiveRules";
import { requireEventMessagingEligibility } from "./eventMessagingEligibility";
import { enrollmentForEvent, isCurrentEnrollment } from "./eventEnrollmentIdentity";

/** Explicit one-person exception; ordinary public/admin registration guards remain unchanged. */
export const registerNovember159 = mutation({
  args: {
    adminSecret: v.string(), eventId: v.id("events"), registrationId: v.id("registrations"),
    confirmClosedRegistrationOverride: v.literal(true),
  },
  handler: async (ctx, args) => {
    requireEventAdmin(args.adminSecret);
    const event = await ctx.db.get(args.eventId);
    const profile = await ctx.db.get(args.registrationId);
    if (!event || event.eventCode !== "nov26" || event.startsAt !== 1794681900000) throw new Error("Wrong event");
    if (!profile || profile.publicApplicantNumber !== 159) throw new Error("Only public applicant 159 is authorized");
    assertNotArchived(profile);
    requireEventMessagingEligibility(profile);
    if (profile.status !== "approved" || profile.profileCompletionStatus !== "completed") throw new Error("Approved complete profile required");
    const now = Date.now();
    if (event.status !== "scheduled" || event.startsAt <= now) throw new Error("Future scheduled event required");
    if (!event.registrationClosesAt || event.registrationClosesAt >= now) throw new Error("Only after registration closes");
    const existing = await enrollmentForEvent(ctx, event._id, profile._id);
    if (existing) {
      if (existing.registrationStatus === "pending" || existing.registrationStatus === "approved") return { changed: false, eventRegistrationId: existing._id };
      throw new Error("Existing enrollment requires separate review");
    }
    if (await registrationStatusForCapacity(ctx, event, profile.gender) !== "pending") throw new Error("Capacity unavailable; separate review required");
    // Do not jump a queue or mutate other applicants through waitlist promotion.
    for await (const queued of ctx.db.query("eventRegistrations").withIndex("by_eventId_and_gender_and_registrationStatus", q => q.eq("eventId", event._id).eq("gender", profile.gender).eq("registrationStatus", "waitlisted"))) {
      if (isCurrentEnrollment(queued)) throw new Error("Existing waitlist requires separate review");
    }
    // This insert is the only write. Indexed duplicate reads participate in OCC.
    const eventRegistrationId = await ctx.db.insert("eventRegistrations", {
      eventId: event._id, registrationId: profile._id, gender: profile.gender,
      registrationStatus: "pending", confirmationStatus: "not_confirmed",
      attendanceStatus: "not_checked_in", eligibilityStatus: "approved_member",
      adminNotes: "Authenticated late registration: public applicant159 / Nov14. Prepared under Omar5379; execution requires separate release authorization. Closure exception only; no capacity override, screening, consent, payment, confirmation, approval or mail.",
      createdAt: now, updatedAt: now,
    });
    return { changed: true, eventRegistrationId };
  },
});
