"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { receivedInterestUpdates, type InterestNoticeInput, type ReviewNoticeInput } from "@/lib/received-interest-updates";

export function ReceivedInterestRibbon({ interests, approved }: { interests: InterestNoticeInput[]; approved: boolean }) {
  const [reviews, setReviews] = useState<ReviewNoticeInput[]>([]);
  const [readyIds, setReadyIds] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    setReadyIds([]); setError(false);
    if (!approved) { setReviews([]); setLoaded(true); return; }
    try {
      const rows: ReviewNoticeInput[] = [];
      let cursor: string | null = null;
      const seen = new Set<string>();
      do {
        const response: Response = await fetch("/api/applicant/female-review" + (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""), { cache: "no-store", signal: request.signal });
        if (!response.ok) throw new Error("Unavailable");
        const payload: { page: ReviewNoticeInput[]; isDone: boolean; continueCursor: string | null } = await response.json();
        if (!Array.isArray(payload.page)) throw new Error("Unavailable");
        rows.push(...payload.page);
        cursor = payload.isDone ? null : payload.continueCursor;
        if (cursor && seen.has(cursor)) throw new Error("Invalid continuation");
        if (cursor) seen.add(cursor);
      } while (cursor);
      if (request.signal.aborted) return;
      setReviews(rows); setLoaded(true);
      for (const item of rows.filter(item => item.state === "contacts_released" && !item.paused && !item.reviewExpired)) {
        const response = await fetch("/api/applicant/female-review?interestId=" + encodeURIComponent(item.interestId), { cache: "no-store", signal: request.signal });
        if (!response.ok) continue;
        const detail = await response.json();
        const profile = detail.profile || detail.counterparty;
        if (!request.signal.aborted && detail.state === "contacts_released" && !detail.paused && (profile?.email?.trim() || profile?.phone?.trim())) setReadyIds(previous => [...previous, item.interestId]);
      }
    } catch { if (!request.signal.aborted) { setReviews([]); setReadyIds([]); setError(true); setLoaded(false); } }
  }, [approved]);
  useEffect(() => {
    void refresh();
    const onFocus = () => { void refresh(); };
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", onFocus); document.addEventListener("visibilitychange", onVisible);
    return () => { controller.current?.abort(); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onVisible); };
  }, [refresh]);
  // Do not render a contradictory generic fallback before workflow authority loads.
  const notices = loaded ? receivedInterestUpdates(interests, reviews, readyIds) : [];
  if (!notices.length && !error) return loaded ? null : <p role="status">Loading interest updates…</p>;
  return <section className="interest-invitation received-interest-ribbon" aria-label="Received interest updates">
    {error ? <p role="alert">Unable to load interest updates. <button className="btn" onClick={() => void refresh()}>Retry</button></p> : <ul className="received-interest-items">{notices.map((notice, index) => <li key={notice.id} data-connection-notice={notice.id}>
      <div className="interest-invitation-copy"><h2>{notice.heading}</h2>{notices.length > 1 && <p>Connection {index + 1}</p>}<p>{notice.copy}</p></div>
      {notice.href && <a className="btn btn-primary" href={notice.href} aria-label={notices.length > 1 ? notice.action + " for connection " + (index + 1) : undefined}>{notice.action}</a>}
    </li>)}</ul>}
  </section>;
}
