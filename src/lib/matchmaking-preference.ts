export type MatchmakingPreference = "events_only" | "beyond_events";

export const matchmakingOptions = [
  { value: "events_only", label: "I only want to participate in in-person events." },
  { value: "beyond_events", label: "I would like to be considered for matchmaking beyond events. You may use my profile and information to find potential matches." },
] as const;

export function isMatchmakingPreference(value: unknown): value is MatchmakingPreference {
  return value === "events_only" || value === "beyond_events";
}

export function matchmakingPreferenceLabel(value: unknown) {
  if (value === "events_only") return "In-person events only";
  if (value === "beyond_events") return "Opted in to matchmaking beyond events";
  return "Not recorded — no consent for matchmaking beyond events";
}
