import { assertNotSecurityRetired, assertContactsNotRetired } from "./registrationSecurity";
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./adminAuthorization";

const normalize = (email: string) => email.trim().toLowerCase();
export const change = mutation({
  args: { adminSecret: v.string(), registrationId: v.id("registrations"), expectedOldEmail: v.string(), newEmail: v.string(), reason: v.string() },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    const email = normalize(args.newEmail);
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || args.reason.trim().length < 5 || args.reason.length > 500) throw new Error("Invalid email or reason");
    const profile = await ctx.db.get(args.registrationId);
    if (!profile) throw new Error("Profile not found");
    assertNotSecurityRetired(profile);
    await assertContactsNotRetired(ctx, email);
    if (profile.email !== args.expectedOldEmail) throw new Error("Email changed; refresh the profile");
    if (normalize(profile.email) === email) throw new Error("Enter a different email");
    // A complete bounded scan includes legacy, non-canonical addresses. Fail closed
    // rather than silently missing duplicates past a truncated result. Convex OCC
    // makes this read + patch atomic against registration creation and other edits.
    const profiles = await ctx.db.query("registrations").take(10001);
    if (profiles.length > 10000) throw new Error("Account scan limit exceeded; manual review required");
    if (profiles.some(p => p._id !== profile._id && (normalize(p.email) === email || p.emailCanonical === email))) throw new Error("Email already registered");
    const sessions = await ctx.db.query("applicantSessions").withIndex("by_registrationId", q => q.eq("registrationId", profile._id)).take(2001);
    const tokens = await ctx.db.query("applicantLoginTokens").withIndex("by_registrationId", q => q.eq("registrationId", profile._id)).take(2001);
    if (sessions.length > 2000 || tokens.length > 2000) throw new Error("Account scan limit exceeded; manual review required");
    const now = Date.now();
    for (const session of sessions) if (session.revokedAt === undefined) await ctx.db.patch(session._id, { revokedAt: now });
    for (const token of tokens) if (token.consumedAt === undefined) await ctx.db.patch(token._id, { consumedAt: now });
    // Old emailed profile-edit links must not remain usable either.
    await ctx.db.patch(profile._id, { email, emailCanonical: email, profileAccessToken: undefined, profileAccessTokenIssuedAt: undefined });
    await ctx.db.insert("adminEmailChangeAudits", { registrationId: profile._id, oldEmail: profile.email, newEmail: email, reason: args.reason.trim(), actor: "authenticated_shared_admin", createdAt: now });
    return { email };
  },
});
