"use client";
import { useEffect, useState } from "react";

export const MATCHMAKER_UPDATED_EVENT = "matchmaker-updated";
type NoticeMatch = {
  _id: string;
  status: string;
  presentedAt?: number;
  contactShared: boolean;
  canApprove: boolean;
  myApproval: boolean;
  withdrawnAt?: number;
  partner?: { email?: string; phone?: string } | null;
};
// The authorized GET also includes legacy shared-contact records without a
// presentation timestamp. Everything else must have actually been presented.
export function isVisibleMatchmakerMatch(match: NoticeMatch) {
  return match.status !== "draft" && (typeof match.presentedAt === "number" || match.contactShared === true);
}
export function matchmakerContactsReady(match: NoticeMatch) {
  return isVisibleMatchmakerMatch(match) && match.contactShared === true &&
    !["closed", "declined", "paused"].includes(match.status) &&
    !!(match.partner?.email?.trim() || match.partner?.phone?.trim());
}
export function matchmakerArticleId(id: string) {
  return "matchmaker-match-" + encodeURIComponent(id);
}
type Notice = { id: string; kind: "review" | "contacts" | "update" };
export function MatchmakerNotifications() {
  const [notices, setNotices] = useState<Notice[]>([]);
  useEffect(() => {
    let controller: AbortController | undefined;
    const refresh = async () => {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      setNotices([]);
      try {
        const response = await fetch("/api/applicant/matchmaker", { cache: "no-store", signal: request.signal });
        if (!response.ok) throw new Error("Unavailable");
        const payload = await response.json();
        if (!Array.isArray(payload.matches)) throw new Error("Unavailable");
        const next: Notice[] = payload.matches.filter(isVisibleMatchmakerMatch).map((match: NoticeMatch) => ({
          id: match._id,
          kind: matchmakerContactsReady(match) ? "contacts" :
            match.canApprove === true && match.myApproval === false && !match.contactShared &&
            match.withdrawnAt === undefined && !["closed", "declined", "paused"].includes(match.status) ? "review" : "update",
        }));
        // Keep only notification metadata, never profile/contact values in state.
        if (!request.signal.aborted) setNotices(next);
      } catch { if (!request.signal.aborted) setNotices([]); }
    };
    void refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener(MATCHMAKER_UPDATED_EVENT, refresh);
    return () => {
      controller?.abort();
      window.removeEventListener("focus", refresh);
      window.removeEventListener(MATCHMAKER_UPDATED_EVENT, refresh);
    };
  }, []);
  if (!notices.length) return null;
  return <section aria-label="Matchmaker notifications">
    {(["review", "contacts", "update"] as const).map(kind => {
      const group = notices.filter(notice => notice.kind === kind);
      if (!group.length) return null;
      const heading = kind === "review" ? "Matchmaker review needed" : kind === "contacts" ? "Matchmaker contacts are ready" : "Matchmaker updates";
      const action = kind === "review" ? "Review introduction" : kind === "contacts" ? "View contact details" : "View introduction";
      return <section key={kind} className="interest-invitation" aria-label={heading}>
        <div className="interest-invitation-copy">
          <h2>{heading}</h2>
          <p>{kind === "review" ? "Review your matchmaker introduction and respond. Contact details stay private until both of you agree and the team shares them." : kind === "contacts" ? "Open your introduction to see the contact details available to you." : "Check the current status of your matchmaker introductions."}</p>
        </div>
        <ul className="interest-invitation-actions">
          {group.map((notice, index) => <li key={notice.id}>
            {group.length > 1 && <span>Introduction {index + 1}</span>}
            <a className="btn btn-primary" aria-label={group.length > 1 ? action + " for matchmaker introduction " + (index + 1) : undefined} href={"/me?matchmaker=" + encodeURIComponent(notice.id) + "#matchmaker-matching"}>{action}</a>
          </li>)}
        </ul>
      </section>;
    })}
  </section>;
}
