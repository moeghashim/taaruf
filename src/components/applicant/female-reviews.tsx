"use client";
import { applicantLoginHref } from "@/lib/applicant-destination";
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ProfileRequirements } from "./profile-requirements";
import { ReviewNextSteps } from "./review-next-steps";
import { formatEducation } from "@/lib/education";
import { FactList } from "@/components/admin/primitives/fact-list";

type Review = { paused?: boolean; interestId: string; state: string; role: string; ownDecision?: string; ownAction?: "review" | null; reviewExpired?: boolean; canView?: boolean; canPause?: boolean };
type Profile = { name?: string; label?: string; applicantNumber?: number; publicApplicantNumber?: number; age?: number; shareableBio?: string; education?: string; job?: string; ethnicity?: string; imageUrls?: string[]; email?: string; phone?: string; spouseRequirement1?: string; spouseRequirement2?: string; spouseRequirement3?: string };
type Access = { paused?: boolean; canPause?: boolean; ownAction?: "review" | null; ownDecision?: string; state: string; role: string; profile?: Profile; counterparty?: Profile };
// List status is not authorization: only the existing detail GET supplies contacts.
const contactsReady = (value: Access | null) => {
  const profile = value?.profile || value?.counterparty;
  return value?.state === "contacts_released" && !value.paused && !!(profile?.email?.trim() || profile?.phone?.trim());
};
const stateCopy: Record<string, string> = {
  in_review: "This connection is being reviewed. Contact details remain private until the team approves sharing them.",
  contacts_released: "Open this review to check the contact details available to your account.",
  closed: "This connection is no longer available. No further response is needed.",
};
const stateLabels: Record<string, string> = {
  in_review: "Connection review", contacts_released: "Contact sharing update", closed: "Connection closed",
};
const reviewExpired = (item: Review) => item.reviewExpired === true;
const needsBrotherReview = (item: Review) => item.role === "brother" && item.ownAction === "review" && !item.paused && !item.reviewExpired && !["closed", "revoked", "expired"].includes(item.state);
const needsSisterConfirmation = (item: Review) => item.role === "sister" && item.ownAction === "review" && !item.paused && !item.reviewExpired && !["closed", "revoked", "expired"].includes(item.state);
export function FemaleReviews({ inline = false, active = true }: { inline?: boolean; active?: boolean }) {
  const [loginHref, setLoginHref] = useState("/login");
  const [rows, setRows] = useState<Review[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const [token, setToken] = useState<string | undefined>();
  const [access, setAccess] = useState<Access | null>(null);
  const [readyIds, setReadyIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const listRequest = useRef(0);
  const [accessVersion, setAccessVersion] = useState(0);
  const [listError, setListError] = useState("");
  const [reviewLoading, setReviewLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const actionInFlight = useRef(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const load = useCallback(async (next: string | null = null) => {
    const requestId = ++listRequest.current;
    setLoading(true); setListError(""); setReadyIds([]);
    try {
      const response = await fetch("/api/applicant/female-review" + (next ? "?cursor=" + encodeURIComponent(next) : ""), { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load reviews.");
      if (requestId !== listRequest.current) return;
      setRows(previous => next ? [...previous, ...payload.page.filter((item: Review) => !previous.some(row => row.interestId === item.interestId))] : payload.page);
      setCursor(payload.continueCursor); setDone(payload.isDone);
    } catch (error) { if (requestId === listRequest.current) { setRows([]); setListError(error instanceof Error ? error.message : "Unable to load reviews."); } }
    finally { if (requestId === listRequest.current) setLoading(false); }
  }, []);
  useEffect(() => {
    setLoginHref(applicantLoginHref(window.location.pathname + window.location.search));
    const sync = () => {
      const params = new URLSearchParams(window.location.search);
      setSelected(params.get("femaleReview"));
      setToken(inline ? undefined : params.get("reviewToken") || undefined);
      setError(""); setMessage("");
    };
    sync();
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    void load();
    const refresh = () => { void load(); setAccessVersion(value => value + 1); };
    window.addEventListener("focus", refresh);
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => { window.removeEventListener("focus", refresh); window.removeEventListener("popstate", sync); window.removeEventListener("hashchange", sync); document.removeEventListener("visibilitychange", visible); };
  }, [load, inline]);
  const row = rows.find(item => item.interestId === selected);
  // Retain the current view during revalidation so a focus event cannot
  // unmount a pressed button before its click. A changed selection is cleared.
  const accessSelection = useRef<string | null>(null);
  const accessRequest = useRef(0);
  useEffect(() => {
    const requestId = ++accessRequest.current;
    if (accessSelection.current !== selected) setAccess(null);
    accessSelection.current = selected;
    if (!selected) return;
    let stopped = false;
    setReviewLoading(true);
    const params = new URLSearchParams({ interestId: selected });
    if (token) params.set("reviewToken", token);
    void fetch("/api/applicant/female-review?" + params, { cache: "no-store" }).then(async response => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Review unavailable.");
      if (!stopped && requestId === accessRequest.current) { setAccess(payload); setError(""); }
    }).catch(error => { if (!stopped && requestId === accessRequest.current) { setAccess(null); setError(error.message); } }).finally(() => { if (!stopped && requestId === accessRequest.current) setReviewLoading(false); });
    return () => { stopped = true; };
  }, [selected, token, row?.role, row?.state, row?.ownAction, row?.paused, accessVersion]);
  useEffect(() => {
    setReadyIds([]);
    if (loading || listError || selected) return;
    const controller = new AbortController();
    // Serial reads bound load; notification state never retains contact values.
    void (async () => {
      for (const item of rows.filter(item => item.state === "contacts_released" && !item.paused && !item.reviewExpired)) {
        try {
          const response = await fetch("/api/applicant/female-review?" + new URLSearchParams({ interestId: item.interestId }), { cache: "no-store", signal: controller.signal });
          if (!response.ok) continue;
          const payload: Access = await response.json();
          if (!controller.signal.aborted && contactsReady(payload)) setReadyIds(previous => [...previous, item.interestId]);
        } catch { /* Fail closed. Refresh retries unavailable contact checks. */ }
      }
    })();
    return () => controller.abort();
  }, [rows, loading, listError, selected, accessVersion]);
  useEffect(() => {
    if (contactsReady(access) && window.location.hash === "#contact-details") {
      document.getElementById("contact-details")?.focus();
    }
  }, [access]);
  const focusedSelection = useRef<string | null>(null);
  useEffect(() => {
    if (!active || !selected) { focusedSelection.current = null; return; }
    if (!inline || !selected || !access || reviewLoading || focusedSelection.current === selected) return;
    const panel = document.getElementById("inline-selected-review");
    if (panel) { panel.focus({ preventScroll: true }); panel.scrollIntoView({ block: "start" }); focusedSelection.current = selected; }
  }, [inline, active, selected, access, reviewLoading]);
  const reviewHref = (id: string, contacts = false) => inline
    ? "/me?femaleReview=" + encodeURIComponent(id) + "#inbound-interests"
    : "/dashboard?femaleReview=" + encodeURIComponent(id) + (contacts ? "#contact-details" : "");
  async function act(body: Record<string, unknown>) {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    const actionSelection = selected;
    ++accessRequest.current;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(["pause", "resume"].includes(String(body.action)) ? "/api/applicant/interests" : "/api/applicant/female-review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(["pause", "resume"].includes(String(body.action)) ? { ...body, action: body.action === "pause" ? "pause_connection" : "resume_connection" } : body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to record your decision.");
      if (selectedRef.current !== actionSelection) { await load(); return; }
      setMessage(body.action === "pause" ? "Connection paused." : body.action === "resume" ? "Connection resumed. New contact disclosure still requires final admin approval." : "Your decision is recorded. Contact details stay private until final admin approval.");
      setAccess(null);
      setAccessVersion(value => value + 1);
      if (body.decision === "decline" || body.confirmed === false) { setSelected(null); setToken(undefined); }
      await load();
    } catch (error) { if (selectedRef.current !== actionSelection) return; ++accessRequest.current; setReviewLoading(false); setAccess(null); setError(error instanceof Error ? error.message : "Unable to record your decision."); }
    finally { actionInFlight.current = false; setBusy(false); }
  }
  const profile = access?.profile || access?.counterparty;
  const invitations = rows.filter(needsBrotherReview);
  const confirmations = rows.filter(needsSisterConfirmation);
  const history = rows.filter(item => !needsBrotherReview(item) && !needsSisterConfirmation(item));
  return <section id="review-notifications" aria-label="Interest notifications" className="applicant-section" onClick={event => {
    if (!inline || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>("a");
    if (!link || !link.getAttribute("href")?.startsWith("/me")) return;
    event.preventDefault();
    window.history.pushState(null, "", link.href);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }}>
    {/* Inline mode uses the portal’s unified top ribbon; keep these banners for standalone reviews only. */}
    {!inline && !!readyIds.length && !selected && !loading && !listError && <section className="interest-invitation contacts-ready" aria-labelledby="contacts-ready-heading">
      <div className="interest-invitation-copy">
        <h2 id="contacts-ready-heading">Contacts are ready</h2>
        <p>The team has approved sharing contact details. Open your review to see the contact details available to you.</p>
      </div>
      <ul className="interest-invitation-actions">
        {readyIds.map((id, index) => <li key={id}>
          {readyIds.length > 1 && <span>Connection {index + 1}</span>}
          <a className="btn btn-primary" aria-label={readyIds.length > 1 ? "View contact details for connection " + (index + 1) : undefined} href={reviewHref(id, true)}>View contact details</a>
        </li>)}
      </ul>
    </section>}
    {!inline && !!invitations.length && !selected && !listError && <section className="interest-invitation" aria-labelledby="interest-invitation-heading">
      <div className="interest-invitation-copy">
        <h2 id="interest-invitation-heading">You Have Received An Interest</h2>
        <p>{invitations.length === 1 ? "This connection is awaiting your review." : "You have multiple profiles to review. Take a look and respond to each invitation."}</p>
        <p className="interest-invitation-privacy">Accepting does not share contact details. Both of you must agree before the team can approve sharing them.</p>
      </div>
      <ul className="interest-invitation-actions">
        {invitations.map((item, index) => <li key={item.interestId}>
          {invitations.length > 1 && <span>Invitation {index + 1}</span>}
          <a className="btn btn-primary" aria-label={invitations.length > 1 ? "Review profile for invitation " + (index + 1) : undefined} href={reviewHref(item.interestId)}>Review profile</a>
        </li>)}
      </ul>
    </section>}
    {!inline && !!confirmations.length && !selected && !listError && <section className="interest-invitation sister-confirmation" aria-labelledby="sister-confirmation-heading">
      <div className="interest-invitation-copy">
        <h2 id="sister-confirmation-heading">Your review is needed</h2>
        <p>This connection is awaiting your review.</p>
        <p className="interest-invitation-privacy">You can confirm or decline after reviewing. Contact details stay private until final admin approval.</p>
      </div>
      <ul className="interest-invitation-actions">
        {confirmations.map((item, index) => <li key={item.interestId}>
          {confirmations.length > 1 && <span>Review {index + 1}</span>}
          <a className="btn btn-primary" aria-label={confirmations.length > 1 ? "Review profile and respond for review " + (index + 1) : undefined} href={reviewHref(item.interestId)}>Review profile and respond</a>
        </li>)}
      </ul>
    </section>}
    {!inline && !selected && !loading && !listError && history.filter(item => !readyIds.includes(item.interestId)).map((item, index) => <section key={item.interestId} className="interest-invitation" aria-label={"Connection update " + (index + 1)}>
      <div className="interest-invitation-copy">
        <h2>{reviewExpired(item) ? "Review invitation expired" : item.paused ? "Connection paused" : stateLabels[item.state] || "Profile review update"}</h2>
        <p>{reviewExpired(item) ? "Please contact the matchmaking team to request a new review invitation." : stateCopy[item.state]}</p>
        {item.ownDecision === "approved" && <p>Your decision: approved.</p>}{item.ownDecision === "approved" && item.state === "in_review" && !item.paused && !item.reviewExpired && <p className="notice success">Contact details will be shared after the admin reviews and approves the match.</p>}
        {item.ownDecision === "declined" && <p>Your decision: declined.</p>}
      </div>
      {!reviewExpired(item) && !["closed", "revoked", "expired"].includes(item.state) && item.canView && <a className="btn btn-primary" aria-label={history.length > 1 ? "View review for connection " + (index + 1) : undefined} href={reviewHref(item.interestId)}>View review</a>}
    </section>)}
    {!inline && selected && <a className="btn" href="/me#applicant-interests">Back to applicant interests</a>}
    <div style={{ padding: inline ? 0 : 16, display: "grid", gap: 16 }}>
      {error && <p className="notice error" role="alert">{error} <a href={loginHref}>Sign in</a> or <button type="button" className="btn" disabled={busy || reviewLoading} onClick={() => setAccessVersion(value => value + 1)}>Retry loading review</button>.</p>}
      {busy && <p role="status">Recording your decision…</p>}
      {message && <p className="notice success" role="status">{message}</p>}
      {listError && <p className="notice error" role="alert">{listError} <a href={loginHref}>Sign in</a> or <button type="button" className="btn" disabled={busy || loading} onClick={() => { void load(); setAccessVersion(value => value + 1); }}>Retry loading reviews</button>.</p>}
      {!rows.length && (!done || loading || selected) && (loading ? <p role="status">Loading reviews…</p> : <p>{done ? "No profile reviews right now." : "No available reviews in the history checked so far. Load more to continue checking."}</p>)}
      {rows.filter(item => item.interestId === selected).map(item => <div key={item.interestId}>
        {item.paused && <p>Paused</p>}
        {/* The embedded profile already sits under Inbound Interests; standalone routes retain their review header. */}
        {(!inline || reviewExpired(item) || item.state !== "in_review") && <><h4>{reviewExpired(item) ? "Review invitation expired" : stateLabels[item.state] || "Profile review update"}</h4><p>{reviewExpired(item) ? "Please contact the matchmaking team to request a new review invitation." : item.ownAction === "review" ? "This connection is awaiting your review." : stateCopy[item.state]}</p></>}
        {item.ownDecision === "approved" && <p>Your decision: approved.</p>}{item.ownDecision === "approved" && item.state === "in_review" && !item.paused && !item.reviewExpired && <p className="notice success">Contact details will be shared after the admin reviews and approves the match.</p>}
        {item.ownDecision === "declined" && <p>Your decision: declined.</p>}


      </div>)}
      {!done && <button type="button" className="btn" disabled={busy || loading} onClick={() => void load(cursor)}>Load more reviews</button>}
      {selected && <section id={inline ? "inline-selected-review" : undefined} tabIndex={-1} aria-label="Selected profile review" className={inline ? "interest-detail-panel" : "selected-profile-review"}>
        {access?.canPause && <button type="button" className="btn" disabled={busy} onClick={() => void act({ action: access.paused ? "resume" : "pause", interestId: selected })}>{access.paused ? "Resume" : "Pause"}</button>}
        {reviewLoading && !access && <p role="status">Loading profile…</p>}
        {profile && inline && <div className="inline-review-content" style={{ visibility: reviewLoading ? "hidden" : undefined }} aria-hidden={reviewLoading || undefined}>
          <div className="interest-detail-head"><div><h3>{profile.label || profile.name || "Applicant #" + (profile.publicApplicantNumber ?? profile.applicantNumber ?? "—")}</h3></div></div>
          <div className="profile-review-box">
            <h4>Profile details</h4>
            <FactList facts={[{ label: "Age", value: profile.age ?? "—" }, { label: "Education", value: formatEducation(profile.education) || "—" }, { label: "Job", value: profile.job || "—" }, { label: "Ethnicity", value: profile.ethnicity || "—" }]} />
          </div>
          <div className="profile-review-box"><ProfileRequirements profile={profile} /></div>
          {!!profile.imageUrls?.length && <div className="profile-review-box">
            <h4>Photos</h4>
            <div className="photo-grid">{profile.imageUrls.map((url, index) => <div key={url} className="photo-card"><Image src={url} alt={"Profile photo " + (index + 1)} width={960} height={720} sizes="(max-width: 900px) 100vw, 1000px" unoptimized /></div>)}</div>
          </div>}
          {profile.shareableBio && <div className="bio-box"><h4>Bio</h4><p>{profile.shareableBio}</p></div>}
          {contactsReady(access) && <section id="contact-details" tabIndex={-1} aria-label="Contact details" className="contact-box"><h4>Contact details</h4>{profile.email && <p>{profile.email}</p>}{profile.phone && <p>{profile.phone}</p>}</section>}
        </div>}
        {profile && !inline && <div style={{ visibility: reviewLoading ? "hidden" : undefined }} aria-hidden={reviewLoading || undefined}><h3>{profile.label || profile.name || "Applicant #" + (profile.publicApplicantNumber ?? profile.applicantNumber ?? "—")}</h3>
          <FactList facts={[{ label: "Age", value: profile.age ?? "—" }, { label: "Education", value: formatEducation(profile.education) || "—" }, { label: "Job", value: profile.job || "—" }, { label: "Ethnicity", value: profile.ethnicity || "—" }]} />
          {profile.shareableBio && <div className="bio-box"><h4>Bio</h4><p>{profile.shareableBio}</p></div>}
          <ProfileRequirements profile={profile} />
          {!!profile.imageUrls?.length && <div className="profile-review-photos">{profile.imageUrls.map((url, index) => <Image key={url} src={url} alt={"Profile photo " + (index + 1)} width={960} height={720} sizes="(max-width: 700px) 100vw, 680px" unoptimized />)}</div>}
          {contactsReady(access) && <section id="contact-details" tabIndex={-1} aria-label="Contact details" className="contact-box"><h4>Contact details</h4>{profile.email && <p>{profile.email}</p>}{profile.phone && <p>{profile.phone}</p>}</section>}
        </div>}
        {!access?.paused && access?.ownAction === "review" && <ReviewNextSteps stage={access.role === "brother" ? "workflow-initial" : "final"} recipientGender={access.role === "brother" ? "male" : "female"} />}
        {!access?.paused && access?.role === "sister" && access.ownAction === "review" && <div className="action-row">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void act({ action: "confirm", interestId: selected, confirmed: true })}>Confirm interest</button>
          <button type="button" className="btn" disabled={busy} onClick={() => void act({ action: "confirm", interestId: selected, confirmed: false })}>Decline</button>
        </div>}
        {!access?.paused && access?.role === "brother" && access.ownAction === "review" && <><p>This connection is awaiting your review. Your decision does not share contact details.</p><div className="action-row">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void act({ action: "respond", interestId: selected, decision: "accept", ...(token ? { reviewToken: token } : {}) })}>Accept</button>
          <button type="button" className="btn" disabled={busy} onClick={() => void act({ action: "respond", interestId: selected, decision: "decline", ...(token ? { reviewToken: token } : {}) })}>Decline</button>
        </div></>}
      </section>}
    </div>
  </section>;
}
