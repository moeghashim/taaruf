"use client";
import { applicantLoginHref } from "@/lib/applicant-destination";
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
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
  useEffect(() => {
    setAccess(null);
    if (!selected) return;
    let stopped = false;
    setReviewLoading(true);
    const params = new URLSearchParams({ interestId: selected });
    if (token) params.set("reviewToken", token);
    void fetch("/api/applicant/female-review?" + params, { cache: "no-store" }).then(async response => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Review unavailable.");
      if (!stopped) { setAccess(payload); setError(""); }
    }).catch(error => { if (!stopped) setError(error.message); }).finally(() => { if (!stopped) setReviewLoading(false); });
    return () => { stopped = true; };
  }, [selected, token, row?.role, row?.state, row?.paused, accessVersion]);
  async function act(body: Record<string, unknown>) {
    if (busy) return;
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
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to record your decision."); }
    finally { setBusy(false); }
  }
  const profile = access?.profile || access?.counterparty;
  return <section id="review-notifications" className="panel applicant-section">
    <div className="panel-head"><div><h3>Profile reviews</h3><p>Review invitations and confirmations. Only you can respond from your account.</p></div><button type="button" className="btn" disabled={busy || loading} onClick={() => { void load(); setAccessVersion(value => value + 1); }}>Refresh</button></div>
    <div style={{ padding: 16, display: "grid", gap: 16 }}>
      {error && <p className="notice error" role="alert">{error} <a href={loginHref}>Sign in</a> or refresh your portal.</p>}
      {message && <p className="notice success" role="status">{message}</p>}
      {listError && <p className="notice error" role="alert">{listError} <a href={loginHref}>Sign in</a>, use Refresh or try Load more again.</p>}
      {loading ? <p role="status">Loading reviews…</p> : !rows.length && <p>{done ? "No profile reviews right now." : "No available reviews in the history checked so far. Load more to continue checking."}</p>}
      {rows.map(item => <div key={item.interestId} style={{ borderBottom: "1px solid var(--line)", paddingBottom: 16 }}>
        {item.paused && <p>Paused</p>}
        <h4>{item.state.replaceAll("_", " ")}</h4><p>{stateCopy[item.state]}</p>
        {!["private_documented", "revoked", "declined"].includes(item.state) && <a className="btn" href={"/dashboard?femaleReview=" + encodeURIComponent(item.interestId)}>Review profile</a>}

      </div>)}
      {!done && <button type="button" className="btn" disabled={busy || loading} onClick={() => void load(cursor)}>Load more reviews</button>}
      {selected && <section aria-label="Selected profile review" style={{ maxWidth: "70ch", display: "grid", gap: 16 }}>
        {access?.matchId && <button type="button" className="btn" disabled={busy} onClick={() => void act({ action: access.paused ? "resume" : "pause", interestId: selected })}>{access.paused ? "Resume" : "Pause"}</button>}
        {reviewLoading && <p role="status">Loading profile…</p>}
        {profile && <><h3>{profile.label || profile.name || "Applicant #" + (profile.publicApplicantNumber ?? profile.applicantNumber ?? "—")}</h3>
          {profile.age && <p>Age {profile.age}</p>}
          <FactList facts={[{ label: "Education", value: profile.education || "—" }, { label: "Job", value: profile.job || "—" }, { label: "Ethnicity", value: profile.ethnicity || "—" }]} />
          {profile.shareableBio && <div className="bio-box"><h4>Bio</h4><p>{profile.shareableBio}</p></div>}
          <ul>{(["spouseRequirement1", "spouseRequirement2", "spouseRequirement3"] as const).map(key => profile[key] && <li key={key}>{profile[key]}</li>)}</ul>
          {!!profile.imageUrls?.length && <div className="photo-grid">{profile.imageUrls.map((url, index) => <Image key={url} src={url} alt={"Profile photo " + (index + 1)} width={320} height={320} unoptimized />)}</div>}
          {access?.state === "contacts_released" && <div className="contact-box"><h4>Contact details</h4><p>{profile.email}</p><p>{profile.phone}</p></div>}
        </>}
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
