"use client";
import { ContactGuidance } from "@/components/applicant/contact-guidance";
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { matchmakingConsentLabel } from "@/lib/matchmaking-consent";
import { isVisibleMatchmakerMatch, matchmakerArticleId, MATCHMAKER_UPDATED_EVENT } from "./matchmaker-notifications";
import { ProfileRequirements } from "./profile-requirements";
import { FactList } from "@/components/admin/primitives/fact-list";
import { applicantLoginHref } from "@/lib/applicant-destination";
export const followupLabels = { contact_made: "Contact made", getting_to_know: "Still getting to know each other", not_proceeding: "Not proceeding", engaged: "Engaged" } as const;
type Followup = { status: keyof typeof followupLabels; updatedAt: number };
type Match = { _id: string; status: string; presentedAt?: number; contactShared: boolean; canWithdraw: boolean; canApprove: boolean; myApproval: boolean; withdrawnAt?: number; myFollowup?: Followup; partner: { publicApplicantNumber?: number; age?: number; gender?: string; maritalStatus?: string; education?: string; job?: string; ethnicity?: string; shareableBio?: string; spouseRequirement1?: string; spouseRequirement2?: string; spouseRequirement3?: string; name?: string; email?: string; phone?: string; images: {url: string; storageId: string}[] } | null };
type Data = { emailEnabled?: boolean; optedIn: boolean; consentUpdatedAt?: number; matches: Match[] };
const date = (time: number) => new Date(time).toLocaleString();
export function MatchmakerMatching({ archived = false, viewerGender, onSessionExpired }: { archived?: boolean; viewerGender?: string; onSessionExpired?: () => void } = {}) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const guard = useRef(false);
  const loadRequest = useRef(0);
  const focusedMatch = useRef<string | null>(null);
  const invalidateLoad = useCallback(() => { ++loadRequest.current; }, []);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const requestId = ++loadRequest.current;
    setLoading(true);
    try {
      const response = await fetch("/api/applicant/matchmaker", { cache: "no-store" });
      if (requestId !== loadRequest.current) return;
      if (response.status === 401) { setData(null); if (onSessionExpired) onSessionExpired(); else window.location.assign(applicantLoginHref("/me#matchmaker-matching")); return; }
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load matchmaker matches.");
      if (requestId !== loadRequest.current) return;
      if (!Array.isArray(payload.matches)) throw new Error("Unable to load matches.");
      setData({ ...payload, matches: payload.matches.filter(isVisibleMatchmakerMatch) });
    } catch (failure) { if (requestId === loadRequest.current) { setData(null); setError(failure instanceof Error ? failure.message : "Unable to load matches."); } }
    finally { if (requestId === loadRequest.current) setLoading(false); }
  }, [onSessionExpired]);
  useEffect(() => {
    void load();
    const refresh = () => { if (!guard.current) void load(); };
    window.addEventListener("focus", refresh);
    return () => { invalidateLoad(); window.removeEventListener("focus", refresh); };
  }, [load, invalidateLoad]);
  useEffect(() => {
    const focusSelected = () => {
      const id = new URLSearchParams(window.location.search).get("matchmaker");
      if (!id || loading || focusedMatch.current === id || !data?.matches.some(match => match._id === id)) return;
      const article = document.getElementById(matchmakerArticleId(id));
      if (!article || article.closest("[hidden]")) return;
      article.focus({ preventScroll: true });
      article.scrollIntoView({ block: "start", behavior: "instant" });
      focusedMatch.current = id;
    };
    const frame = requestAnimationFrame(focusSelected);
    window.addEventListener("hashchange", focusSelected);
    window.addEventListener("popstate", focusSelected);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", focusSelected);
      window.removeEventListener("popstate", focusSelected);
    };
  }, [data, loading]);
  async function act(body: Record<string, unknown>, success: string) {
    if (guard.current) return;
    invalidateLoad();
    guard.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/applicant/matchmaker", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (response.status === 401) { if (onSessionExpired) onSessionExpired(); else window.location.assign(applicantLoginHref("/me#matchmaker-matching")); return; }
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to save. Please refresh and try again.");
      setMessage(success); await load();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to save."); await load(); }
    finally { window.dispatchEvent(new Event(MATCHMAKER_UPDATED_EVENT)); guard.current = false; setBusy(false); }
  }
  return <section id="matchmaker-matching" className="panel applicant-section" aria-labelledby="matchmaker-heading">
    <div className="panel-head"><div><h2 id="matchmaker-heading">Matchmaker Matching</h2><p>Introductions from the matchmaking team, separate from your submitted interests.</p></div></div>
    <div style={{ padding: 20, display: "grid", gap: 20, minWidth: 0 }}>
      {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
      {loading && <p role="status">Loading your matchmaking preferences…</p>}
      {!loading && !data && <button className="btn" onClick={() => { setError(""); void load(); }}>Try again</button>}
      {data && <>
        <div>{archived && <p>Your profile is archived. You can still opt out of future background matchmaking; opting in requires restoring availability.</p>}<p>Alhamdulillah, 1 Plus 1 has several matchmakers who are dedicated to finding matches within the pool, beyond events. Please check the box below if you would like to be considered for background matches.</p>
          <label style={{ display: "flex", alignItems: "start", gap: 10, marginTop: 16, paddingBlock: 8 }}><input type="checkbox" checked={data.optedIn} disabled={busy || loading || (archived && !data.optedIn)} onChange={event => void act({ action: "consent", optedIn: event.target.checked }, event.target.checked ? "You are now opted in to future background matches." : "You are opted out of future background matches.")} style={{ marginTop: 4, width: 18, height: 18, flexShrink: 0 }} /><span>{matchmakingConsentLabel}</span></label>
          <p style={{ color: "var(--mute)", fontSize: 13 }}>You can opt out at any time. This changes future introductions only; use Withdraw on an individual match before contacts are shared. Existing shared-contact records remain available.</p>
          {data.consentUpdatedAt && <small>Preference saved {date(data.consentUpdatedAt)}</small>}
        </div>
        {data.matches.length === 0 && <div><h3>No matchmaker introductions yet</h3><p>When the team presents a match, it will appear here.</p></div>}
        {data.matches.map(match => <article key={match._id} id={matchmakerArticleId(match._id)} tabIndex={-1} aria-label="Matchmaker introduction" style={{ borderTop: "1px solid var(--line)", paddingTop: 20, display: "grid", gap: 14, minWidth: 0 }}>
          <div><h3>{match.partner?.name || (match.partner ? "Applicant #" + (match.partner.publicApplicantNumber ?? "—") : "Matchmaker introduction")}</h3><p>{match.contactShared ? "Contact details shared" : match.withdrawnAt ? "You withdrew from this introduction." : ["closed", "declined"].includes(match.status) ? "Introduction closed" : match.status === "paused" ? "Introduction paused" : match.canApprove && !match.myApproval ? "This connection is awaiting your review." : match.myApproval ? "Your agreement has been saved." : "No action is needed from you."}</p>{match.presentedAt && <small>Presented {date(match.presentedAt)}</small>}</div>
          {!match.partner && <p>The other applicant’s profile is no longer available. This introduction remains in your history.</p>}
          {match.partner && <>
            <FactList facts={[{ label: "Age", value: String(match.partner.age ?? "—") }, { label: "Education", value: match.partner.education || "—" }, { label: "Occupation", value: match.partner.job || "—" }, { label: "Ethnicity", value: match.partner.ethnicity || "—" }, { label: "Marital status", value: match.partner.maritalStatus || "—" }]} />
            {match.partner.shareableBio && <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{match.partner.shareableBio}</p>}
            <ProfileRequirements profile={match.partner} />
            {match.partner.images?.length > 0 && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,220px),1fr))", gap: 12 }}>{match.partner.images.map((image, index) => <Image key={image.storageId} src={image.url} width={600} height={800} unoptimized alt={"Match profile photo " + (index + 1)} style={{ width: "100%", height: "auto", maxHeight: 480, objectFit: "contain" }} />)}</div>}
            {match.contactShared && <div><h4>Contact details</h4><ContactGuidance viewerGender={viewerGender} /><p style={{ overflowWrap: "anywhere" }}>{match.partner.email || "Email unavailable"}<br />{match.partner.phone || "Phone unavailable"}</p></div>}
          </>}
          {match.canWithdraw && <><p>Contact details stay private until you both agree and an admin explicitly shares them.</p><div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}><button className="btn btn-primary" disabled={busy || loading || !match.canApprove || match.myApproval} onClick={() => { if (window.confirm("Agree to this introduction? Your contacts remain private until both applicants agree and the team shares them.")) void act({ action: "approve", matchId: match._id }, "Your agreement has been saved."); }}>{match.myApproval ? "You agreed" : "Agree to this introduction"}</button><button className="btn" disabled={busy || loading} onClick={() => { if (window.confirm("Withdraw from this introduction? This does not change your preference for future matches.")) void act({ action: "withdraw", matchId: match._id }, "You withdrew from this introduction."); }}>Withdraw</button></div></>}
          {match.contactShared && <div><label style={{ display: "grid", gap: 8 }}>Your follow-up status<select aria-label="Your follow-up status" className="input" style={{ width: "100%", minWidth: 0, padding: 10, fontSize: 16 }} disabled={busy || loading} value={match.myFollowup?.status || ""} onChange={event => void act({ action: "followup", matchId: match._id, status: event.target.value }, "Your follow-up status has been saved.")}><option value="" disabled>Select a status</option>{Object.entries(followupLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{match.myFollowup && <small>You updated this {date(match.myFollowup.updatedAt)}. The team can see your response.</small>}<p style={{ color: "var(--mute)", fontSize: 13 }}>Your update does not overwrite the other applicant’s response.</p></div>}
        </article>)}
        {data.emailEnabled === true && <p>We’ll email you when the matchmaking team presents a match for you to review.</p>}
      </>}
    </div>
  </section>;
}
