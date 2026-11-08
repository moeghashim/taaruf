import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./adminAuthorization";
import type { QueryCtx, MutationCtx } from "./_generated/server";
const credentials = { sessionHash: v.optional(v.string()), profileToken: v.optional(v.string()), signupCapabilityHash: v.optional(v.string()) };
async function resolveOwner(ctx: QueryCtx | MutationCtx, args: { sessionHash?: string; profileToken?: string; signupCapabilityHash?: string }) {
  if ([args.sessionHash, args.profileToken, args.signupCapabilityHash].filter(Boolean).length !== 1) throw new Error("Unauthorized");
  if (args.sessionHash) {
    const session = await ctx.db.query("applicantSessions").withIndex("by_sessionHash", q => q.eq("sessionHash", args.sessionHash!)).unique();
    if (!session || session.revokedAt || session.expiresAt <= Date.now() || !await ctx.db.get(session.registrationId)) throw new Error("Unauthorized");
    return { registrationId: session.registrationId };
  }
  if (args.profileToken) {
    const registration = await ctx.db.query("registrations").withIndex("by_profileAccessToken", q => q.eq("profileAccessToken", args.profileToken!)).unique();
    if (!registration) throw new Error("Unauthorized");
    return { registrationId: registration._id };
  }
  if (!/^[a-f0-9]{64}$/.test(args.signupCapabilityHash!)) throw new Error("Unauthorized");
  return { signupCapabilityHash: args.signupCapabilityHash };
}
export const authorize = query({
  args: { adminSecret: v.optional(v.string()), ...credentials },
  handler: async (ctx, args) => { requireAdmin(args.adminSecret); await resolveOwner(ctx, args); return true; },
});
/** Only the server that uploaded actual bytes can record their returned storage ID. */
export const record = mutation({
  args: { adminSecret: v.optional(v.string()), storageId: v.id("_storage"), ...credentials },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    const owner = await resolveOwner(ctx, args);
    const metadata = await ctx.db.system.get(args.storageId);
    if (!metadata || metadata.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(metadata.contentType ?? "")) throw new Error("Invalid image");
    if (await ctx.db.query("photoUploads").withIndex("by_storageId", q => q.eq("storageId", args.storageId)).unique()) throw new Error("Upload already recorded");
    await ctx.db.insert("photoUploads", { storageId: args.storageId, ...owner, createdAt: Date.now() });
    return null;
  },
});
