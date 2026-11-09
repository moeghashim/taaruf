import { capabilityAllowed } from "./capabilitySecurity";
import { requireAdmin, withoutCapabilities } from "./adminAuthorization";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

type ShareScope = Pick<Doc<"profileShares">, "ownerRegistrationId" | "recipientRegistrationId" | "interestId" | "matchId">;
async function resolvedInterest(ctx: QueryCtx, share: ShareScope): Promise<Doc<"interests"> | null | false> {
  if (share.ownerRegistrationId === share.recipientRegistrationId) return false;
  let interestId = share.interestId;
  if (share.matchId) {
    const match = await ctx.db.get(share.matchId);
    if (!match || match.testResetAt !== undefined || ["closed", "declined"].includes(match.status)) return false;
    if (![match.maleRegistrationId, match.femaleRegistrationId].includes(share.ownerRegistrationId) ||
        ![match.maleRegistrationId, match.femaleRegistrationId].includes(share.recipientRegistrationId)) return false;
    if (interestId && match.interestId && interestId !== match.interestId) return false;
    interestId ??= match.interestId;
  }
  if (interestId) {
    const interest = await ctx.db.get(interestId);
    if (!interest || interest.testReset || interest.visibility === "internal_only" ||
        ["closed", "declined", "withdrawn"].includes(interest.status)) return false;
    if (![interest.fromRegistrationId, interest.toRegistrationId].includes(share.ownerRegistrationId) ||
        ![interest.fromRegistrationId, interest.toRegistrationId].includes(share.recipientRegistrationId)) return false;
    return interest;
  }
  // A context-free bearer share must never bypass a recipient-specific choice or private lifecycle.
  for (const [from, to] of [[share.ownerRegistrationId, share.recipientRegistrationId], [share.recipientRegistrationId, share.ownerRegistrationId]]) {
    const interests = await ctx.db.query("interests").withIndex("by_fromRegistrationId_and_toRegistrationId", q => q.eq("fromRegistrationId", from).eq("toRegistrationId", to)).take(1001);
    if (interests.length > 1000 || interests.some(row => row.senderPhotoConsent !== undefined || row.senderPhotoConsentRevokedAt !== undefined || row.testReset || row.visibility === "internal_only" || ["closed", "declined", "withdrawn"].includes(row.status))) return false;
  }
  return null;
}
async function available(ctx: QueryCtx, share: Doc<"profileShares">) {
  return await capabilityAllowed(ctx, share.createdAt) && share.revokedAt === undefined && share.status !== "closed" && await resolvedInterest(ctx, share) !== false;
}
async function imagesAllowed(ctx: QueryCtx, share: ShareScope & { includeImages: boolean }, owner: Doc<"registrations"> | null) {
  if (!share.includeImages || !owner) return false;
  const interest = await resolvedInterest(ctx, share);
  if (interest === false) return false;
  if (interest?.fromRegistrationId === owner._id && interest.senderPhotoConsent !== undefined) {
    return interest.senderPhotoConsent === "yes" && interest.senderPhotoConsentRevokedAt === undefined;
  }
  return owner.photoSharingPermission === "yes";
}

import { assertProfileCompleted, getRegistrationOrThrow } from "./interestRules";

export const getAll = query({
  args: { adminSecret: v.optional(v.string()),},
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    const candidates = await ctx.db.query("profileShares").take(1000);
    const shares = [];
    for (const share of candidates) if (await available(ctx, share)) shares.push(share);

    return withoutCapabilities(await Promise.all(
      shares.map(async (share) => {
        const owner = await ctx.db.get(share.ownerRegistrationId);
        const recipient = await ctx.db.get(share.recipientRegistrationId);

        return {
          ...share,
          owner,
          recipient,
        };
      })
    ));
  },
});

export const create = mutation({
  args: { adminSecret: v.optional(v.string()),
    ownerRegistrationId: v.id("registrations"),
    recipientRegistrationId: v.id("registrations"),
    includeImages: v.boolean(),
    shareToken: v.string(),
    interestId: v.optional(v.id("interests")),
    matchId: v.optional(v.id("matches")),
  },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    if (await resolvedInterest(ctx, args) === false) throw new Error("Share context is unavailable; select the active interest");
    const ownerRegistration = await getRegistrationOrThrow(ctx, args.ownerRegistrationId);
    assertProfileCompleted(ownerRegistration, "Profile owner");
    if (args.includeImages && !(await imagesAllowed(ctx, args, ownerRegistration))) throw new Error("Photo sharing requires explicit owner consent");

    if (await ctx.db.query("profileShares").withIndex("by_shareToken", q => q.eq("shareToken", args.shareToken)).first()) throw new Error("Use a fresh share token");
    const now = Date.now();
    return await ctx.db.insert("profileShares", {
      ownerRegistrationId: args.ownerRegistrationId,
      recipientRegistrationId: args.recipientRegistrationId,
      includeImages: args.includeImages,
      status: "shared",
      shareToken: args.shareToken,
      interestId: args.interestId,
      matchId: args.matchId,
      sentAt: now,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const getByShareToken = query({
  args: {
    shareToken: v.string(),
  },
  handler: async (ctx, args) => {
    const share = await ctx.db
      .query("profileShares")
      .withIndex("by_shareToken", (q) => q.eq("shareToken", args.shareToken))
      .first();

    if (!share || !(await available(ctx, share))) return null;

    const owner = await ctx.db.get(share.ownerRegistrationId);
    const recipient = await ctx.db.get(share.recipientRegistrationId);

    const includeImages = await imagesAllowed(ctx, share, owner);
    const images = includeImages ? (await Promise.all((owner?.imageStorageIds ?? []).map(async storageId => ({ storageId, url: await ctx.storage.getUrl(storageId) })))).filter((image): image is { storageId: typeof image.storageId; url: string } => image.url !== null) : [];
    return {
      images,
      includeImages,
      status: share.status,
      owner: owner ? {
        age: owner.age, gender: owner.gender, maritalStatus: owner.maritalStatus,
        education: owner.education, job: owner.job, ethnicity: owner.ethnicity,
        prayerCommitment: owner.prayerCommitment, hijabResponse: owner.hijabResponse,
        spouseRequirement1: owner.spouseRequirement1, spouseRequirement2: owner.spouseRequirement2,
        spouseRequirement3: owner.spouseRequirement3, shareableBio: owner.shareableBio,
        photoSharingPermission: owner.photoSharingPermission,
        imageStorageIds: includeImages ? owner.imageStorageIds : [],
      } : null,
      recipient: recipient ? { name: recipient.name } : null,
    };
  },
});

export const markViewed = mutation({
  args: {
    shareToken: v.string(),
  },
  handler: async (ctx, args) => {
    const share = await ctx.db
      .query("profileShares")
      .withIndex("by_shareToken", (q) => q.eq("shareToken", args.shareToken))
      .first();

    if (!share || !(await available(ctx, share))) {
      throw new Error("Shared profile not found");
    }

    await ctx.db.patch(share._id, {
      status: share.status === "shared" ? "viewed" : share.status,
      viewedAt: share.viewedAt ?? Date.now(),
      updatedAt: Date.now(),
    });

    return share._id;
  },
});
