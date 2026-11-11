"use client";
import { useCallback, useEffect, useState } from "react";
import type { adminMutualInterests } from "@/lib/admin-mutual-interest";
type Rows = Awaited<ReturnType<typeof adminMutualInterests>>;
export function useMutualInterests() {
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(n => n + 1), []);
  const [state, setState] = useState<{ rows?: Rows; error?: string }>({});
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Keep the last complete snapshot mounted so background refresh cannot erase note drafts.
    void fetch("/api/admin/bridge", { method: "POST", credentials: "same-origin", cache: "no-store", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "query", name: "interests.getAll", args: {} }) })
      .then(async response => {
        if (!response.ok) throw new Error(response.status === 401 ? "Your admin session has expired. Sign in again." : "Interest data unavailable. Retry to refresh.");
        const { result } = await response.json();
        if (!Array.isArray(result)) throw new Error("Interest data unavailable. Retry to refresh.");
        if (!controller.signal.aborted) setState({ rows: result });
      }).catch(error => { if (!controller.signal.aborted) setState(previous => ({ ...previous, error: error.message })); }).finally(() => { if (!controller.signal.aborted) timer = setTimeout(retry, 30000); });
    return () => { controller.abort(); clearTimeout(timer); };
  }, [attempt, retry]);
  useEffect(() => {
    window.addEventListener("focus", retry); window.addEventListener("admin-data-refresh", retry);
    return () => { window.removeEventListener("focus", retry); window.removeEventListener("admin-data-refresh", retry); };
  }, [retry]);
  return { ...state, retry };
}
