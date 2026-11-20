import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./adminAuthorization";
import { assertNotSecurityRetired } from "./registrationSecurity";
import { assertNotArchived } from "./archiveRules";

// Incident6469: exact approved scope, never an arbitrary profile patch API.
const TARGETS = [
  { number: 18, id: "j57ekj8fxrjezvdkt7htveb1m183ztyc", gender: "female", match: "jd71jx6gmaagd5yddcwcyrjhgn84w9sr", status: "closed", male: "j57a6d4r3y358yep0wyf9vbth1848m1w", female: "j57ekj8fxrjezvdkt7htveb1m183ztyc", counterpart: 96 },
  { number: 96, id: "j57a6d4r3y358yep0wyf9vbth1848m1w", gender: "male", match: "jd71jx6gmaagd5yddcwcyrjhgn84w9sr", status: "closed", male: "j57a6d4r3y358yep0wyf9vbth1848m1w", female: "j57ekj8fxrjezvdkt7htveb1m183ztyc", counterpart: 18 },
  { number: 74, id: "j57abxkz9yvhd6h9sz9ahhsmgs844d2q", gender: "female", match: "jd75qmbp3e2a1bwmmh79fsmcf58546sq", status: "declined", male: "j579s66m5k8aag4spymvccnw9s84gjzb", female: "j57abxkz9yvhd6h9sz9ahhsmgs844d2q", counterpart: 127 },
] as const;

export const clearObsoletePointers = internalMutation({
  args: { adminSecret: v.string(), confirmRepair6469: v.literal(true) },
  returns: v.object({ changedNumbers: v.array(v.number()) }),
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    const validated = [];
    // Validate every target before writing any target. Convex retries the entire
    // serializable transaction if a pointer or either history index changes.
    for (const target of TARGETS) {
      const person = await ctx.db.query("registrations")
        .withIndex("by_publicApplicantNumber", q => q.eq("publicApplicantNumber", target.number)).unique();
      if (!person || person._id !== target.id || person.gender !== target.gender ||
          person.status !== "approved" || person.profileCompletionStatus !== "completed" ||
          (person.searchStatus ?? "active") !== "active") throw new Error("Exact eligible canonical applicant required");
      assertNotSecurityRetired(person);
      assertNotArchived(person);
      if (person.activeMatchId !== undefined && person.activeMatchId !== target.match) {
        throw new Error("Pointer changed; entire repair aborted");
      }
      const matchId = ctx.db.normalizeId("matches", target.match);
      const match = matchId ? await ctx.db.get(matchId) : null;
      const counterpart = await ctx.db.query("registrations")
        .withIndex("by_publicApplicantNumber", q => q.eq("publicApplicantNumber", target.counterpart)).unique();
      if (!match || match.status !== target.status || match.testResetAt !== undefined ||
          match.maleRegistrationId !== target.male || match.femaleRegistrationId !== target.female ||
          counterpart?._id !== (target.gender === "female" ? target.male : target.female)) {
        throw new Error("Expected terminal match or counterpart changed");
      }
      const male = await ctx.db.query("matches")
        .withIndex("by_maleRegistrationId", q => q.eq("maleRegistrationId", person._id)).take(1001);
      const female = await ctx.db.query("matches")
        .withIndex("by_femaleRegistrationId", q => q.eq("femaleRegistrationId", person._id)).take(1001);
      if (male.length > 1000 || female.length > 1000) throw new Error("History overflow; repair aborted");
      // More conservative than normal availability: drafts/reset/paused rows
      // require separate review rather than being silently dismissed here.
      if ([...male, ...female].some(m => m.status !== "closed" && m.status !== "declined")) {
        throw new Error("Competing nonterminal match; entire repair aborted");
      }
      validated.push({ person, number: target.number });
    }
    const changedNumbers: number[] = [];
    for (const { person, number } of validated) {
      if (person.activeMatchId !== undefined) {
        await ctx.db.patch(person._id, { activeMatchId: undefined });
        changedNumbers.push(number);
      }
    }
    // No updatedAt, history, decisions, consent, scheduler or queue changes.
    return { changedNumbers };
  },
});
