"use client";
import { applicantLoginHref } from "@/lib/applicant-destination";
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ProfileRequirements } from "./profile-requirements";
import { FactList } from "@/components/admin/primitives/fact-list";

type Review = { paused?: boolean; interestId: string; state: string; role: string; reviewExpiresAt?: number; matchId?: string };
type Profile = { name?: string; label?: string; applicantNumber?: number; publicApplicantNumber?: number; age?: number; shareableBio?: string; education?: string; job?: string; ethnicity?: string; imageUrls?: string[]; email?: string; phone?: string; spouseRequirement1?: string; spouseRequirement2?: string; spouseRequirement3?: string };
type Access = { paused?: boolean; matchId?: string | null; state: string; role: string; profile?: Profile; counterparty?: Profile };
const stateCopy: Record<string, string> = {
  private_documented: "Your interest is private with the team. The brother has not been notified.",
  awaiting_brother_review: "A profile is ready for the brother’s review. Accepting does not share contact details.",
  awaiting_sister_confirmation: "The brother accepted. The sister must explicitly confirm before a match is created.",
  pending_admin_approval: "You both agreed. Your match is pending final admin approval. Contact details remain private.",
  contacts_released: "Final admin approval is complete. Contact details are available in your portal.",
  declined: "This review was declined. No further response is needed.",
  revoked: "The team revoked this review. Its link is no longer available.",
};
const stateLabels: Record<string, string> = {
  private_documented: "With the matchmaking team",
  awaiting_brother_review: "Waiting for a response",
  awaiting_sister_confirmation: "Waiting for confirmation",
  pending_admin_approval: "Waiting for the team’s approval",
  contacts_released: "Contact details available",
  declined: "Review declined", revoked: "Review withdrawn", closed: "Review closed",
};
const reviewExpired = (item: Review) => item.state === "awaiting_brother_review" && item.reviewExpiresAt !== undefined && item.reviewExpiresAt <= Date.now();
const needsBrotherReview = (item: Review) => item.role === "brother" && item.state === "awaiting_brother_review" && !item.paused && !reviewExpired(item);
const needsSisterConfirmation = (item: Review) => item.role === "sister" && item.state === "awaiting_sister_confirmation" && !item.paused && !item.matchId;
export function FemaleReviews() {
  const [loginHref, setLoginHref] = useState("/login");
  const [rows, setRows] = useState<Review[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [token, setToken] = useState<string | undefined>();
  const [access, setAccess] = useState<Access | null>(null);
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
    setLoading(true); setListError("");
    try {
      const response = await fetch("/api/applicant/female-review" + (next ? "?cursor=" + encodeURIComponent(next) : ""), { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load reviews.");
      if (requestId !== listRequest.current) return;
      setRows(previous => next ? [...previous, ...payload.page.filter((item: Review) => !previous.some(row => row.interestId === item.interestId))] : payload.page);
      setCursor(payload.continueCursor); setDone(payload.isDone);
    } catch (error) { if (requestId === listRequest.current) setListError(error instanceof Error ? error.message : "Unable to load reviews."); }
    finally { if (requestId === listRequest.current) setLoading(false); }
  }, []);
  useEffect(() => {
    setLoginHref(applicantLoginHref(window.location.pathname + window.location.search));
    const params = new URLSearchParams(window.location.search);
    setSelected(params.get("femaleReview"));
    setToken(params.get("reviewToken") || undefined);
    void load();
    const refresh = () => { void load(); setAccessVersion(value => value + 1); };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [load]);
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
  }, [selected, token, row?.role, row?.state, row?.paused, accessVersion]);
  async function act(body: Record<string, unknown>) {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    ++accessRequest.current;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(["pause", "resume"].includes(String(body.action)) ? "/api/applicant/interests" : "/api/applicant/female-review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(["pause", "resume"].includes(String(body.action)) ? { ...body, action: body.action === "pause" ? "pause_connection" : "resume_connection" } : body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to record your decision.");
      setMessage(body.action === "pause" ? "Connection paused." : body.action === "resume" ? "Connection resumed. New contact disclosure still requires final admin approval." : "Your decision is recorded. Contact details stay private until final admin approval.");
      setAccess(null);
      setAccessVersion(value => value + 1);
      if (body.decision === "decline" || body.confirmed === false) { setSelected(null); setToken(undefined); }
      await load();
    } catch (error) { ++accessRequest.current; setReviewLoading(false); setAccess(null); setError(error instanceof Error ? error.message : "Unable to record your decision."); }
    finally { actionInFlight.current = false; setBusy(false); }
  }
  const profile = access?.profile || access?.counterparty;
  const invitations = rows.filter(needsBrotherReview);
  const confirmations = rows.filter(needsSisterConfirmation);
  const history = rows.filter(item => !needsBrotherReview(item) && !needsSisterConfirmation(item));
  return <section id="review-notifications" aria-label="Profile reviews" className="panel applicant-section">
    {!!invitations.length && !selected && <section className="interest-invitation" aria-labelledby="interest-invitation-heading">
      <div className="interest-invitation-copy">
        <h2 id="interest-invitation-heading">A sister is interested in you</h2>
        <p>{invitations.length === 1 ? "A profile is ready for you to review. Take a look and decide whether you’re interested." : "You have multiple profiles to review. Take a look and respond to each invitation."}</p>
        <p className="interest-invitation-privacy">Accepting does not share contact details. Both of you must agree before the team can approve sharing them.</p>
      </div>
      <ul className="interest-invitation-actions">
        {invitations.map((item, index) => <li key={item.interestId}>
          {invitations.length > 1 && <span>Invitation {index + 1}</span>}
          <a className="btn btn-primary" aria-label={invitations.length > 1 ? "Review profile for invitation " + (index + 1) : undefined} href={"/dashboard?femaleReview=" + encodeURIComponent(item.interestId)}>Review profile</a>
        </li>)}
      </ul>
    </section>}
    {!!confirmations.length && !selected && <section className="interest-invitation sister-confirmation" aria-labelledby="sister-confirmation-heading">
      <div className="interest-invitation-copy">
        <h2 id="sister-confirmation-heading">{confirmations.length === 1 ? "The brother has accepted — your final approval is needed" : "Brothers have accepted — your final approval is needed"}</h2>
        <p>{confirmations.length === 1 ? "He has accepted your interest. Review his profile and confirm whether you would like to proceed." : "They have accepted your interest. Review each profile and confirm whether you would like to proceed."} A match will only be created after you confirm.</p>
        <p className="interest-invitation-privacy">You can confirm or decline after reviewing. Contact details stay private until final admin approval.</p>
      </div>
      <ul className="interest-invitation-actions">
        {confirmations.map((item, index) => <li key={item.interestId}>
          {confirmations.length > 1 && <span>Review {index + 1}</span>}
          <a className="btn btn-primary" aria-label={confirmations.length > 1 ? "Review profile and respond for review " + (index + 1) : undefined} href={"/dashboard?femaleReview=" + encodeURIComponent(item.interestId)}>Review profile and respond</a>
        </li>)}
      </ul>
    </section>}
    <div className="panel-head"><div><h3>Profile reviews</h3><p>Review invitations and confirmations. Only you can respond from your account.</p></div><button type="button" className="btn" disabled={busy || loading} onClick={() => { void load(); setAccessVersion(value => value + 1); }}>Refresh</button></div>
    <div style={{ padding: 16, display: "grid", gap: 16 }}>
      {error && <p className="notice error" role="alert">{error} <a href={loginHref}>Sign in</a> or refresh your portal.</p>}
      {busy && <p role="status">Recording your decision…</p>}
      {message && <p className="notice success" role="status">{message}</p>}
      {listError && <p className="notice error" role="alert">{listError} <a href={loginHref}>Sign in</a>, use Refresh or try Load more again.</p>}
      {!rows.length && (loading ? <p role="status">Loading reviews…</p> : <p>{done ? "No profile reviews right now." : "No available reviews in the history checked so far. Load more to continue checking."}</p>)}
      {(selected ? rows : history).map(item => <div key={item.interestId} style={{ borderBottom: "1px solid var(--line)", paddingBottom: 16 }}>
        {item.paused && <p>Paused</p>}
        <h4>{reviewExpired(item) ? "Review invitation expired" : stateLabels[item.state] || "Profile review update"}</h4><p>{reviewExpired(item) ? "Please contact the matchmaking team to request a new review invitation." : stateCopy[item.state]}</p>
        {!reviewExpired(item) && !["private_documented", "revoked", "declined", "closed"].includes(item.state) && <a className="btn" href={"/dashboard?femaleReview=" + encodeURIComponent(item.interestId)}>{needsBrotherReview(item) ? "Review profile" : "View review"}</a>}

      </div>)}
      {!done && <button type="button" className="btn" disabled={busy || loading} onClick={() => void load(cursor)}>Load more reviews</button>}
      {selected && <section aria-label="Selected profile review" className="selected-profile-review">
        {access?.matchId && <button type="button" className="btn" disabled={busy} onClick={() => void act({ action: access.paused ? "resume" : "pause", interestId: selected })}>{access.paused ? "Resume" : "Pause"}</button>}
        {reviewLoading && !access && <p role="status">Loading profile…</p>}
        {profile && <div style={{ visibility: reviewLoading ? "hidden" : undefined }} aria-hidden={reviewLoading || undefined}><h3>{profile.label || profile.name || "Applicant #" + (profile.publicApplicantNumber ?? profile.applicantNumber ?? "—")}</h3>
          <FactList facts={[{ label: "Age", value: profile.age ?? "—" }, { label: "Education", value: profile.education || "—" }, { label: "Job", value: profile.job || "—" }, { label: "Ethnicity", value: profile.ethnicity || "—" }]} />
          {profile.shareableBio && <div className="bio-box"><h4>Bio</h4><p>{profile.shareableBio}</p></div>}
          <ProfileRequirements profile={profile} />
          {!!profile.imageUrls?.length && <div className="profile-review-photos">{profile.imageUrls.map((url, index) => <Image key={url} src={url} alt={"Profile photo " + (index + 1)} width={960} height={720} sizes="(max-width: 700px) 100vw, 680px" unoptimized />)}</div>}
          {access?.state === "contacts_released" && <div className="contact-box"><h4>Contact details</h4><p>{profile.email}</p><p>{profile.phone}</p></div>}
        </div>}
        {!access?.paused && access?.role === "sister" && access.state === "awaiting_sister_confirmation" && <div className="action-row">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void act({ action: "confirm", interestId: selected, confirmed: true })}>Confirm mutual interest</button>
          <button type="button" className="btn" disabled={busy} onClick={() => void act({ action: "confirm", interestId: selected, confirmed: false })}>Decline</button>
        </div>}
        {!access?.paused && access?.role === "brother" && access.state === "awaiting_brother_review" && <><p>Your acceptance asks the sister to confirm. It is not final admin approval.</p><div className="action-row">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void act({ action: "respond", interestId: selected, decision: "accept", ...(token ? { reviewToken: token } : {}) })}>Accept</button>
          <button type="button" className="btn" disabled={busy} onClick={() => void act({ action: "respond", interestId: selected, decision: "decline", ...(token ? { reviewToken: token } : {}) })}>Decline</button>
        </div></>}
      </section>}
    </div>
  </section>;
}
