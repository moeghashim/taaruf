"use client";
import { useCallback, useEffect, useState } from "react";
import type { adminMutualInterests } from "@/lib/admin-mutual-interest";
import { watchInterestUpdates } from "./interest-updates";
type Rows = Awaited<ReturnType<typeof adminMutualInterests>>;
export function useMutualInterests() {
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(n => n + 1), []);
  const [state, setState] = useState<{ rows?: Rows; error?: string }>({});
  useEffect(() => {
    // Never clear the last complete snapshot during refresh/reconnect: keyed editors
    // remain mounted and their unsaved drafts survive background updates.
    const watcher = watchInterestUpdates<Rows[number]>(
      // Snapshot success cannot clear a stream outage; the watcher combines
      // independent snapshot/transport errors and signals actual recovery.
      rows => setState(previous => ({ ...previous, rows })),
      error => setState(previous => ({ ...previous, error })),
    );
    window.addEventListener("focus", watcher.refresh);
    window.addEventListener("admin-data-refresh", watcher.refresh);
    return () => {
      watcher.stop();
      window.removeEventListener("focus", watcher.refresh);
      window.removeEventListener("admin-data-refresh", watcher.refresh);
    };
  }, [attempt]);
  return { ...state, retry };
}
