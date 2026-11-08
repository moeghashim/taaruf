import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/** Durable evidence: lack of a current attachment is never proof of ownership. */
export async function assertImageOwnership(ctx: MutationCtx, owner: Id<"registrations"> | undefined, ids: Id<"_storage">[], signupCapabilityHash?: string) {
  const registration = owner ? await ctx.db.get(owner) : null;
  // Preserve legacy ownership before removal, even for photos omitted from this update.
  for (const storageId of registration?.imageStorageIds ?? []) {
    const ledger = await ctx.db.query("photoUploads").withIndex("by_storageId", q => q.eq("storageId", storageId)).unique();
    if (!ledger) await ctx.db.insert("photoUploads", { storageId, registrationId: owner!, createdAt: Date.now() });
  }
  for (const storageId of new Set(ids)) {
    const ledger = await ctx.db.query("photoUploads").withIndex("by_storageId", q => q.eq("storageId", storageId)).unique();
    if (!ledger || (owner ? ledger.registrationId !== owner : ledger.registrationId !== undefined || !signupCapabilityHash || ledger.signupCapabilityHash !== signupCapabilityHash)) throw new Error("Image does not belong to this applicant");
    for await (const other of ctx.db.query("registrations")) {
      if (other._id !== owner && other.imageStorageIds?.includes(storageId)) throw new Error("Image does not belong to this applicant");
    }
  }
}
export async function claimSignupImages(ctx: MutationCtx, owner: Id<"registrations">, ids: Id<"_storage">[]) {
  for (const storageId of new Set(ids)) {
    const ledger = await ctx.db.query("photoUploads").withIndex("by_storageId", q => q.eq("storageId", storageId)).unique();
    if (!ledger || ledger.registrationId) throw new Error("Image does not belong to this applicant");
    await ctx.db.patch(ledger._id, { registrationId: owner, signupCapabilityHash: undefined });
  }
}
