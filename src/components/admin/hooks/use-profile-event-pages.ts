"use client";
import { useCallback, useEffect, useState } from "react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import type { adminQueries } from "@/lib/admin-operations";
type Name = "matches.workbenchPage" | "interests.workbenchPage" | "events.profileFilterCatalog" | "events.profileFilterMembership";
type Args<K extends Name> = Omit<FunctionArgs<(typeof adminQueries)[K]>, "adminSecret" | "paginationOpts">;
type Row<K extends Name> = FunctionReturnType<(typeof adminQueries)[K]>["page"][number];

/** Publish only complete scans. Failure clears stale/partial results, including on refresh.
 * No automatic tight retries or repeated roster polling: retry/focus/admin refresh starts a new scan. */
export function useProfileEventPages<K extends Name>(name: K, args: Args<K> | "skip") {
  const serialized = JSON.stringify(args);
  const key = name + serialized;
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(n => n + 1), []);
  const [state, setState] = useState<{ key: string; rows?: Row<K>[]; error?: string }>();
  useEffect(() => {
    if (serialized === '"skip"') return;
    const controller = new AbortController();
    let stopped = false;
    setState({ key });
    async function load() {
      try {
        let cursor: string | null = null;
        const cursors = new Set<string>();
        const rows: Row<K>[] = [];
        for (;;) {
          const response: Response = await fetch("/api/admin/bridge", {
            method: "POST", credentials: "same-origin", cache: "no-store",
            headers: { "Content-Type": "application/json" }, signal: controller.signal,
            body: JSON.stringify({ kind: "query", name, args: { ...JSON.parse(serialized), paginationOpts: { numItems: 100, cursor } } }),
          });
          if (!response.ok) throw new Error("Event data unavailable");
          const { result }: { result: { page: Row<K>[]; isDone: boolean; continueCursor: string } } = await response.json();
          if (!result || !Array.isArray(result.page) || typeof result.isDone !== "boolean") throw new Error("Invalid event page");
          rows.push(...result.page);
          if (result.isDone) break;
          if (typeof result.continueCursor !== "string" || cursors.has(result.continueCursor)) throw new Error("Incomplete event data");
          cursor = result.continueCursor;
          cursors.add(cursor as string);
        }
        if (!stopped) setState({ key, rows });
      } catch {
        if (!stopped) setState({ key, error: "Event data unavailable" });
      }
    }
    void load();
    return () => { stopped = true; controller.abort(); };
  }, [key, name, serialized, attempt]);
  useEffect(() => {
    window.addEventListener("focus", retry);
    window.addEventListener("admin-data-refresh", retry);
    return () => { window.removeEventListener("focus", retry); window.removeEventListener("admin-data-refresh", retry); };
  }, [retry]);
  return { rows: state?.key === key ? state.rows : undefined, error: state?.key === key ? state.error : undefined, retry };
}
