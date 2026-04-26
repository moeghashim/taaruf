"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";

/**
 * Reads the admin display name from the `settings` table (key:
 * "admin_name"). Used by the Dashboard greeting and the Sidebar
 * footer so admins can change their display name without a redeploy.
 *
 * Returns:
 *   - the trimmed name when set
 *   - null when the row exists but is empty
 *   - undefined while the query is loading
 */
export function useAdminName(): string | null | undefined {
  const value = useQuery(api.settings.get, { key: "admin_name" });
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
