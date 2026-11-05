import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

export const matchmakingPreference = v.union(v.literal("events_only"), v.literal("beyond_events"));
export type MatchmakingPreference = "events_only" | "beyond_events";
export const MATCHMAKING_PREFERENCE_COPY_VERSION = "matchmaking-2026-11-04-v1";
export const MATCHMAKING_PREFERENCE_CHOICES = {
  events_only: "I only want to participate in in-person events.",
  beyond_events: "I would like to be considered for matchmaking beyond events. You may use my profile and information to find potential matches.",
} as const;

// Call only after resolving the owning registration from an authenticated token/session.
// Never call from a generic profile save or returning-event registration.
export async function changeMatchmakingPreference(
  ctx: MutationCtx,
  registration: Doc<"registrations">,
  preference: MatchmakingPreference,
  expectedUpdatedAt: number | null,
) {
  if ((registration.matchmakingPreferenceUpdatedAt ?? null) !== expectedUpdatedAt) {
    throw new Error("Matchmaking preference changed. Refresh and try again.");
  }
  // Strictly increasing even for two requests within the same millisecond.
  const updatedAt = Math.max(Date.now(), (registration.matchmakingPreferenceUpdatedAt ?? 0) + 1);
  const fields = {
    matchmakingPreference: preference,
    matchmakingPreferenceUpdatedAt: updatedAt,
    matchmakingPreferenceCopyVersion: MATCHMAKING_PREFERENCE_COPY_VERSION,
  };
  await ctx.db.patch(registration._id, fields);
  await ctx.db.insert("matchmakingPreferenceHistory", {
    registrationId: registration._id,
    previousPreference: registration.matchmakingPreference ?? null,
    matchmakingPreference: preference,
    updatedAt,
    copyVersion: MATCHMAKING_PREFERENCE_COPY_VERSION,
    source: "applicant_update",
  });
  return fields;
}
