import { v } from "convex/values";

// Additive: retain legacy answers, including female "open", without a migration.
export const hijabResponse = v.union(
  v.literal("yes"), v.literal("no"), v.literal("open"),
  v.literal("burqa"), v.literal("niqab"), v.literal("working_on_it"),
);
