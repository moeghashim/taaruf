import { isSecurityRetired, assertContactsNotRetired } from "./registrationSecurity";
import { withCurrentAge } from "./birthdays";
import { sessionAllowed, capabilityAllowed } from "./capabilitySecurity";
import { requireAdmin } from "./adminAuthorization";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const DAY_MS = 24 * 60 * 60 * 1000;
const LOGIN_TOKEN_TTL_MS = 30 * 60 * 1000;
const SESSION_TTL_MS = 30 * DAY_MS;

export const createLoginToken = mutation({
  args: { adminSecret: v.optional(v.string()),
    email: v.string(),
    tokenHash: v.string(),
    expiresInMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    const email = args.email.trim().toLowerCase();
    try { await assertContactsNotRetired(ctx, email); } catch { return null; }
    const exactRegistration = await ctx.db
      .query("registrations")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    const registration =
      exactRegistration ??
      (await ctx.db.query("registrations").take(1000)).find(
        (candidate) => candidate.email.trim().toLowerCase() === email
      ) ??
      null;

    if (!registration || isSecurityRetired(registration)) {
      return null;
    }

    const now = Date.now();
    await ctx.db.insert("applicantLoginTokens", {
      registrationId: registration._id,
      tokenHash: args.tokenHash,
      expiresAt: now + (args.expiresInMs ?? LOGIN_TOKEN_TTL_MS),
      createdAt: now,
    });

    return {
      registrationId: registration._id,
      name: registration.name,
      email: registration.email,
    };
  },
});

export const claimLoginToken = mutation({
  args: { adminSecret: v.optional(v.string()),
    tokenHash: v.string(),
    sessionHash: v.string(),
  },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    const loginToken = await ctx.db
      .query("applicantLoginTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();

    if (!loginToken || loginToken.consumedAt !== undefined || loginToken.expiresAt <= Date.now() || !(await capabilityAllowed(ctx, loginToken.createdAt))) {
      return null;
    }

    const registration = await ctx.db.get(loginToken.registrationId);
    if (!registration || isSecurityRetired(registration)) {
      return null;
    }

    const now = Date.now();
    await ctx.db.patch(loginToken._id, {
      consumedAt: now,
    });

    await ctx.db.insert("applicantSessions", {
      registrationId: registration._id,
      sessionHash: args.sessionHash,
      expiresAt: now + SESSION_TTL_MS,
      createdAt: now,
      lastUsedAt: now,
    });

    return {
      registrationId: registration._id,
      name: registration.name,
      email: registration.email,
      expiresAt: now + SESSION_TTL_MS,
    };
  },
});

export const getSession = query({
  args: { adminSecret: v.optional(v.string()),
    sessionHash: v.string(),
  },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    const session = await ctx.db
      .query("applicantSessions")
      .withIndex("by_sessionHash", (q) => q.eq("sessionHash", args.sessionHash))
      .unique();

    if (!session || !(await sessionAllowed(ctx, session))) {
      return null;
    }

    const registration = await ctx.db.get(session.registrationId);
    if (!registration || isSecurityRetired(registration)) {
      return null;
    }

    return {
      session,
      registration: await withCurrentAge(ctx, registration),
    };
  },
});

export const touchSession = mutation({
  args: { adminSecret: v.optional(v.string()),
    sessionHash: v.string(),
  },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    const session = await ctx.db
      .query("applicantSessions")
      .withIndex("by_sessionHash", (q) => q.eq("sessionHash", args.sessionHash))
      .unique();

    if (!session || !(await sessionAllowed(ctx, session))) {
      return false;
    }

    await ctx.db.patch(session._id, {
      lastUsedAt: Date.now(),
    });

    return true;
  },
});

export const revokeSession = mutation({
  args: { adminSecret: v.optional(v.string()),
    sessionHash: v.string(),
  },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    const session = await ctx.db
      .query("applicantSessions")
      .withIndex("by_sessionHash", (q) => q.eq("sessionHash", args.sessionHash))
      .unique();

    if (!session || session.revokedAt) {
      return false;
    }

    await ctx.db.patch(session._id, {
      revokedAt: Date.now(),
    });

    return true;
  },
});
