import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Server-only credential, never shipped to the browser. Fail closed if unset.
function requireAdmin(adminSecret: string) {
  if (!process.env.ATTENDANCE_ADMIN_SECRET || adminSecret !== process.env.ATTENDANCE_ADMIN_SECRET) throw new Error("Unauthorized");
}
export const list = query({
  args: { adminSecret: v.string(), eventId: v.optional(v.id("events")), search: v.optional(v.string()) },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    const events = await ctx.db.query("events").withIndex("by_startsAt").order("desc").take(100);
    const rows = args.eventId ? await ctx.db.query("eventAttendees").withIndex("by_eventId_and_registrationId", q => q.eq("eventId", args.eventId!)).take(1000) : [];
    const attendees = (await Promise.all(rows.map(async row => {
      const applicant = await ctx.db.get(row.registrationId);
      return applicant ? { registrationId: applicant._id, applicantNumber: applicant.publicApplicantNumber ?? null, name: applicant.name, gender: applicant.gender, addedAt: row.addedAt } : null;
    }))).filter(row => row !== null);
    const search = args.search?.trim().toLocaleLowerCase() ?? "";
    const candidates = search ? (await ctx.db.query("registrations").take(1000))
      .filter(row => String(row.publicApplicantNumber) === search || row.name.toLocaleLowerCase().includes(search))
      .slice(0, 20).map(row => ({ registrationId: row._id, applicantNumber: row.publicApplicantNumber ?? null, name: row.name, gender: row.gender })) : [];
    return { events: events.map(row => ({ eventId: row._id, title: row.title, startsAt: row.startsAt })), attendees, total: attendees.length, candidates };
  },
});
// Retired by #38. Keep the read-only archive and schema; never erase history.
export const setAttendance = mutation({
  args: { adminSecret: v.string(), eventId: v.id("events"), registrationId: v.id("registrations"), attending: v.boolean() },
  handler: async (_ctx, args) => {
    requireAdmin(args.adminSecret);
    throw new Error("Event Attendees is retired; use Events approval and check-in");
  },
});
