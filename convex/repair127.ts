import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./adminAuthorization";
import { assertNotSecurityRetired } from "./registrationSecurity";
import { assertNotArchived } from "./archiveRules";

// One approved incident, not a general-purpose profile patch API.
const PROFILE = "j579s66m5k8aag4spymvccnw9s84gjzb";
const COUNTERPART = "j57abxkz9yvhd6h9sz9ahhsmgs844d2q";
const OLD_MATCH = "jd75qmbp3e2a1bwmmh79fsmcf58546sq";
export const clearObsoletePointer = internalMutation({
  args: { adminSecret: v.string(), confirmRepair127: v.literal(true) },
  returns: v.object({ changed: v.boolean() }),
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    const person = await ctx.db.query("registrations")
      .withIndex("by_publicApplicantNumber", q => q.eq("publicApplicantNumber", 127)).unique();
    if (!person || person._id !== PROFILE || person.gender !== "male" || person.status !== "approved") {
      throw new Error("Exact canonical applicant127 required");
    }
    assertNotSecurityRetired(person);
    assertNotArchived(person);
    if (person.activeMatchId !== undefined && person.activeMatchId !== OLD_MATCH) {
      throw new Error("Pointer changed; repair aborted");
    }
    const oldId = ctx.db.normalizeId("matches", OLD_MATCH);
    const old = oldId ? await ctx.db.get(oldId) : null;
    const counterpart = await ctx.db.query("registrations")
      .withIndex("by_publicApplicantNumber", q => q.eq("publicApplicantNumber", 74)).unique();
    if (!old || old.status !== "declined" || old.maleRegistrationId !== person._id ||
        old.femaleRegistrationId !== COUNTERPART || counterpart?._id !== COUNTERPART ||
        old.testResetAt !== undefined) throw new Error("Historical declined match changed");
    const male = await ctx.db.query("matches")
      .withIndex("by_maleRegistrationId", q => q.eq("maleRegistrationId", person._id)).take(1001);
    const female = await ctx.db.query("matches")
      .withIndex("by_femaleRegistrationId", q => q.eq("femaleRegistrationId", person._id)).take(1001);
    if (male.length > 1000 || female.length > 1000) throw new Error("Match history requires review");
    // Deliberately conservative: even draft/reset nonterminal matches abort.
    if ([...male, ...female].some(m => !["closed", "declined", "paused"].includes(m.status))) {
      throw new Error("Another active match; repair aborted");
    }
    if (person.activeMatchId === undefined) return { changed: false };
    // Convex serializable transaction retries recheck pointer and index ranges.
    // No updatedAt, history, consent, queue, scheduler, or notification writes.
    await ctx.db.patch(person._id, { activeMatchId: undefined });
    return { changed: true };
  },
});
