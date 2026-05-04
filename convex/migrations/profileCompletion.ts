import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internal } from "../_generated/api";
import { action, internalMutation } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

type BackfillResult = {
  scanned: number;
  completed: Array<{ id: Doc<"registrations">["_id"]; name: string; email: string }>;
  needsProfileEmail: Array<{ id: Doc<"registrations">["_id"]; name: string; email: string }>;
  dryRun: boolean;
};

type LegacyProfileContentBackfillResult = {
  scanned: number;
  updated: number;
  aboutBackfilled: number;
  lookingForBackfilled: number;
  batches: number;
  isDone: boolean;
  continueCursor: string;
  dryRun: boolean;
  examples: Array<{
    id: Doc<"registrations">["_id"];
    name: string;
    email: string;
    fields: string[];
  }>;
};

type LegacyProfileContentBackfillBatchResult = Omit<
  LegacyProfileContentBackfillResult,
  "batches"
>;

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

function profileText(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function legacyLookingForParts(value: string) {
  const normalized = value
    .replace(/\r\n/g, "\n")
    .split(/\n+|;|,/)
    .map((part) => part.trim())
    .filter(Boolean);

  return (normalized.length ? normalized : [value.trim()]).slice(0, 3);
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

export const backfillLegacyProfileContentBatch = internalMutation({
  args: {
    dryRun: v.boolean(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("registrations").paginate(args.paginationOpts);
    const examples = [];
    let updated = 0;
    let aboutBackfilled = 0;
    let lookingForBackfilled = 0;

    for (const registration of page.page) {
      const patch: {
        shareableBio?: string;
        spouseRequirement1?: string;
        spouseRequirement2?: string;
        spouseRequirement3?: string;
      } = {};
      const fields: string[] = [];
      const legacyAbout = profileText(registration.describeYourself);

      if (!profileText(registration.shareableBio) && legacyAbout) {
        patch.shareableBio = legacyAbout;
        fields.push("shareableBio");
        aboutBackfilled += 1;
      }

      const legacyLookingFor = profileText(registration.lookingFor);
      if (legacyLookingFor) {
        const parts = legacyLookingForParts(legacyLookingFor);
        const spouseFields = [
          "spouseRequirement1",
          "spouseRequirement2",
          "spouseRequirement3",
        ] as const;

        for (const [index, field] of spouseFields.entries()) {
          if (!profileText(registration[field]) && parts[index]) {
            patch[field] = parts[index];
            fields.push(field);
          }
        }
      }

      if (fields.length) {
        updated += 1;
        if (fields.some((field) => field.startsWith("spouseRequirement"))) {
          lookingForBackfilled += 1;
        }

        examples.push({
          id: registration._id,
          name: registration.name,
          email: registration.email,
          fields,
        });

        if (!args.dryRun) {
          await ctx.db.patch(registration._id, patch);
        }
      }
    }

    return {
      scanned: page.page.length,
      updated,
      aboutBackfilled,
      lookingForBackfilled,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
      dryRun: args.dryRun,
      examples: examples.slice(0, 20),
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

export const backfillLegacyProfileContent = action({
  args: {
    dryRun: v.optional(v.boolean()),
    batchSize: v.optional(v.number()),
    maxBatches: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<LegacyProfileContentBackfillResult> => {
    const dryRun = args.dryRun ?? true;
    const batchSize = args.batchSize ?? 200;
    const maxBatches = args.maxBatches ?? 50;
    let cursor: string | null = null;
    let isDone = false;
    let batches = 0;
    const examples: LegacyProfileContentBackfillResult["examples"] = [];
    const totals = {
      scanned: 0,
      updated: 0,
      aboutBackfilled: 0,
      lookingForBackfilled: 0,
    };

    while (!isDone && batches < maxBatches) {
      const batch: LegacyProfileContentBackfillBatchResult = await ctx.runMutation(
        internal.migrations.profileCompletion.backfillLegacyProfileContentBatch,
        {
          dryRun,
          paginationOpts: {
            numItems: batchSize,
            cursor,
          },
        }
      );

      totals.scanned += batch.scanned;
      totals.updated += batch.updated;
      totals.aboutBackfilled += batch.aboutBackfilled;
      totals.lookingForBackfilled += batch.lookingForBackfilled;
      examples.push(...batch.examples.slice(0, Math.max(0, 20 - examples.length)));
      cursor = batch.continueCursor;
      isDone = batch.isDone;
      batches += 1;
    }

    return {
      ...totals,
      batches,
      isDone,
      continueCursor: cursor ?? "",
      dryRun,
      examples,
    };
  },
});
