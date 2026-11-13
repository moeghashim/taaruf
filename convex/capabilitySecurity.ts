import { isSecurityRetired } from "./registrationSecurity";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

// Durable, monotonic setting: never remove it or roll back readers after activation.
export const CAPABILITY_CUTOFF_KEY = "capabilitySecurityCutoffMs";
export async function capabilityAllowed(ctx: QueryCtx, issuedAt?: number): Promise<boolean> {
  const setting = await ctx.db.query("settings").withIndex("by_key", q => q.eq("key", CAPABILITY_CUTOFF_KEY)).unique();
  if (!setting) return true; // Preparation deployment does not invalidate anything.
  const cutoff = Number(setting.value);
  if (!/^\d+$/.test(setting.value) || !Number.isSafeInteger(cutoff) || cutoff <= 0) return false;
  // Equality is denied: no capability issued in the cutoff millisecond survives.
  return issuedAt !== undefined && Number.isSafeInteger(issuedAt) && issuedAt > cutoff;
}
export async function sessionAllowed(ctx: QueryCtx, session: Doc<"applicantSessions"> | null): Promise<boolean> {
  if (!session) return false;
  const registration = await ctx.db.get(session.registrationId);
  if (!registration || isSecurityRetired(registration)) return false;
  return !!session && session.revokedAt === undefined && session.expiresAt > Date.now() && await capabilityAllowed(ctx, session.createdAt);
}
export async function profileCapabilityAllowed(ctx: QueryCtx, registration: Doc<"registrations">): Promise<boolean> {
  // Never use profileUpdateRequestedAt: email retries can change it without rotating a token.
  return !isSecurityRetired(registration) && await capabilityAllowed(ctx, registration.profileAccessTokenIssuedAt);
}
