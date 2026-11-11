"use client";
import { useRef, useState } from "react";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { refreshAdminData } from "@/components/admin/hooks/use-admin-transport";
import { followupLabels } from "@/components/applicant/matchmaker-matching";
export function isMatchmaker(match: Doc<"matches"> | null | undefined) { return !!match && !match.interestId && (match.interestType === "admin_suggested" || match.initiatedBy === "admin_recommendation"); }
export function MatchmakerActions({ match, male, female, onMessage }: { match: Doc<"matches">; male: Doc<"registrations"> | null; female: Doc<"registrations"> | null; onMessage: (message: string) => void }) {
  const [busy, setBusy] = useState(false); const guard = useRef(false);
  if (!isMatchmaker(match)) return null;
  const shared = match.status === "contact_shared" || match.contactGate === "contacts_released" || match.adminReleasedAt !== undefined || match.contactSharedNotificationSentAt !== undefined;
  const closed = ["closed", "declined", "paused"].includes(match.status) || match.matchmakerWithdrawnAt !== undefined;
  const bothOptedIn = male?.backgroundMatchmakingOptIn === true && female?.backgroundMatchmakingOptIn === true;
  async function act(action: "present" | "release") {
    if (guard.current || !window.confirm(action === "present" ? "Present this match to both applicants? It will become visible in their portals. Both applicants’ current opt-in and eligibility will be checked again." : "Share contacts with both applicants? Both must have explicitly agreed. Shared contact records are retained.")) return;
    guard.current = true; setBusy(true);
    try { const response = await fetch("/api/admin/matchmaker", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, matchId: match._id }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "Unable to update match."); onMessage(result.message); }
    catch (failure) { onMessage(failure instanceof Error ? failure.message : "Unable to update match."); }
    finally { refreshAdminData(); guard.current = false; setBusy(false); }
  }
  return <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
    <strong>Matchmaker Matching</strong>
    {!shared && !match.matchmakerPresentedAt && <><p>Private draft — not visible to applicants. No notifications have been sent.</p><p>Background opt-in: male {male?.backgroundMatchmakingOptIn === true ? "yes" : "not opted in"}; female {female?.backgroundMatchmakingOptIn === true ? "yes" : "not opted in"}.</p><button className="btn btn-primary" disabled={busy || !bothOptedIn || closed} onClick={() => void act("present")}>{busy ? "Presenting…" : "Present to applicants"}</button>{!bothOptedIn && <small>Both applicants must explicitly opt in from their portals before presentation.</small>}</>}
    {!!match.matchmakerPresentedAt && <p>Presented {new Date(match.matchmakerPresentedAt).toLocaleString()}. Portal notifications created; email rollout is separately gated.</p>}
    {!!match.matchmakerWithdrawnAt && <p>Withdrawn by {match.matchmakerWithdrawnBy === match.maleRegistrationId ? "male applicant" : "female applicant"} · {new Date(match.matchmakerWithdrawnAt).toLocaleString()}</p>}
    {!shared && !!match.matchmakerPresentedAt && !closed && <><p>Contact approval: male {match.maleMatchmakerApprovalAt ? "agreed" : "waiting"}; female {match.femaleMatchmakerApprovalAt ? "agreed" : "waiting"}.</p><button className="btn btn-primary" disabled={busy || !match.maleMatchmakerApprovalAt || !match.femaleMatchmakerApprovalAt} onClick={() => void act("release")}>{busy ? "Sharing…" : "Share contacts"}</button></>}
    {shared && <p>Contacts shared — record retained.</p>}
    {([ ["Male applicant", match.maleFollowup], ["Female applicant", match.femaleFollowup] ] as const).map(([label, followup]) => <div key={label}><strong>{label} follow-up</strong><p>{followup ? followupLabels[followup.status] : "No update yet"}</p>{followup && <small>Submitted by {label.toLowerCase()} · {new Date(followup.updatedAt).toLocaleString()}</small>}</div>)}
  </div>;
}
