import { v } from "convex/values";
import { internal } from "../_generated/api";
import { action, internalMutation } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

type BackfillResult = {
  scanned: number;
  completed: Array<{ id: Doc<"registrations">["_id"]; name: string; email: string }>;
  needsProfileEmail: Array<{ id: Doc<"registrations">["_id"]; name: string; email: string }>;
  dryRun: boolean;
};

function hasRequiredProfileFields(registration: Doc<"registrations">) {
  return Boolean(
    registration.ethnicity?.trim() &&
    registration.imageStorageIds?.length &&
    registration.prayerCommitment &&
    registration.hijabResponse &&
    registration.spouseRequirement1?.trim() &&
    registration.spouseRequirement2?.trim() &&
    registration.spouseRequirement3?.trim() &&
    registration.shareableBio?.trim() &&
    registration.photoSharingPermission
  );
}

export const backfillBatch = internalMutation({
  args: {
    dryRun: v.boolean(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 200;
    const registrations = await ctx.db.query("registrations").take(limit);
    const now = Date.now();
    const completed = [];
    const needsProfileEmail = [];

    for (const registration of registrations) {
      if (hasRequiredProfileFields(registration)) {
        completed.push({
          id: registration._id,
          name: registration.name,
          email: registration.email,
        });

        if (!args.dryRun && registration.profileCompletionStatus !== "completed") {
          await ctx.db.patch(registration._id, {
            profileCompletionStatus: "completed",
            profileCompletedAt: registration.profileCompletedAt ?? now,
            profileLastUpdatedAt: registration.profileLastUpdatedAt ?? now,
          });
        }
      } else {
        needsProfileEmail.push({
          id: registration._id,
          name: registration.name,
          email: registration.email,
        });

        if (!args.dryRun && registration.profileCompletionStatus !== "not_started") {
          await ctx.db.patch(registration._id, {
            profileCompletionStatus: "not_started",
          });
        }
      }
    }

    return {
      scanned: registrations.length,
      completed,
      needsProfileEmail,
      dryRun: args.dryRun,
    };
  },
});

export const backfillProfileCompletionStatuses = action({
  args: {
    dryRun: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<BackfillResult> => {
    return await ctx.runMutation(internal.migrations.profileCompletion.backfillBatch, {
      dryRun: args.dryRun ?? true,
      limit: args.limit,
    });
  },
});
