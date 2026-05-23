import { v } from "convex/values";
import { internal } from "../_generated/api";
import { action, internalMutation, query } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

const PUBLIC_APPLICANT_NUMBER_HWM_KEY = "publicApplicantNumberHighWaterMark";

type Assignment = {
  id: Doc<"registrations">["_id"];
  name: string;
  email: string;
  previousPublicApplicantNumber: number | null;
  publicApplicantNumber: number;
};

type BackfillResult = {
  dryRun: boolean;
  total: number;
  updated: number;
  highWaterMark: number;
  examples: Assignment[];
};

function hasValidPublicApplicantNumber(registration: Doc<"registrations">) {
  return (
    typeof registration.publicApplicantNumber === "number" &&
    Number.isInteger(registration.publicApplicantNumber) &&
    registration.publicApplicantNumber > 0
  );
}

export const backfillBatch = internalMutation({
  args: {
    dryRun: v.boolean(),
  },
  handler: async (ctx, args): Promise<BackfillResult> => {
    const registrations = (await ctx.db.query("registrations").collect()).sort(
      (a, b) => a._creationTime - b._creationTime
    );
    const assignments: Assignment[] = registrations.map((registration, index) => ({
      id: registration._id,
      name: registration.name,
      email: registration.email,
      previousPublicApplicantNumber: hasValidPublicApplicantNumber(registration)
        ? registration.publicApplicantNumber!
        : null,
      publicApplicantNumber: index + 1,
    }));

    const seen = new Set<number>();
    for (const assignment of assignments) {
      if (seen.has(assignment.publicApplicantNumber)) {
        throw new Error(`Duplicate public applicant number planned: ${assignment.publicApplicantNumber}`);
      }
      seen.add(assignment.publicApplicantNumber);
    }

    const changed = assignments.filter(
      (assignment) => assignment.previousPublicApplicantNumber !== assignment.publicApplicantNumber
    );

    if (!args.dryRun) {
      for (const assignment of changed) {
        await ctx.db.patch(assignment.id, {
          publicApplicantNumber: assignment.publicApplicantNumber,
        });
      }

      const highWaterMark = String(assignments.length);
      const hwmRow = await ctx.db
        .query("settings")
        .withIndex("by_key", (q) => q.eq("key", PUBLIC_APPLICANT_NUMBER_HWM_KEY))
        .first();
      if (hwmRow) {
        await ctx.db.patch(hwmRow._id, { value: highWaterMark });
      } else {
        await ctx.db.insert("settings", {
          key: PUBLIC_APPLICANT_NUMBER_HWM_KEY,
          value: highWaterMark,
        });
      }
    }

    return {
      dryRun: args.dryRun,
      total: assignments.length,
      updated: changed.length,
      highWaterMark: assignments.length,
      examples: changed.slice(0, 20),
    };
  },
});

export const backfillCreationOrderPublicApplicantNumbers = action({
  args: {
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<BackfillResult> => {
    return await ctx.runMutation(internal.migrations.publicApplicantNumbers.backfillBatch, {
      dryRun: args.dryRun ?? true,
    });
  },
});

export const verifyPublicApplicantNumbers = query({
  args: {},
  handler: async (ctx) => {
    const registrations = (await ctx.db.query("registrations").collect()).sort(
      (a, b) => a._creationTime - b._creationTime
    );
    const byNumber = new Map<number, Doc<"registrations">[]>();
    const missing: Array<{ id: Doc<"registrations">["_id"]; name: string; email: string }> = [];
    let max = 0;

    for (const registration of registrations) {
      if (!hasValidPublicApplicantNumber(registration)) {
        missing.push({ id: registration._id, name: registration.name, email: registration.email });
        continue;
      }
      max = Math.max(max, registration.publicApplicantNumber!);
      const rows = byNumber.get(registration.publicApplicantNumber!) ?? [];
      rows.push(registration);
      byNumber.set(registration.publicApplicantNumber!, rows);
    }

    const duplicates = [...byNumber.entries()]
      .filter(([, rows]) => rows.length > 1)
      .map(([publicApplicantNumber, rows]) => ({
        publicApplicantNumber,
        registrations: rows.map((registration) => ({
          id: registration._id,
          name: registration.name,
          email: registration.email,
        })),
      }));

    const mohanad = registrations.find(
      (registration) => registration.name.trim().toLowerCase() === "mohanad ghashim"
    );

    return {
      total: registrations.length,
      missingCount: missing.length,
      duplicateCount: duplicates.length,
      max,
      missing: missing.slice(0, 20),
      duplicates: duplicates.slice(0, 20),
      mohanad: mohanad
        ? {
            id: mohanad._id,
            name: mohanad.name,
            applicantNumber: mohanad.applicantNumber ?? null,
            publicApplicantNumber: mohanad.publicApplicantNumber ?? null,
          }
        : null,
    };
  },
});
