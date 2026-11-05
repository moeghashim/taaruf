"use client";

import { useId, useState } from "react";
import { matchmakingOptions, matchmakingPreferenceLabel, type MatchmakingPreference } from "@/lib/matchmaking-preference";

export function MatchmakingChoices({ value, onChange, disabled = false }: {
  value: MatchmakingPreference | "";
  onChange: (value: MatchmakingPreference) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return <fieldset className="matchmaking-choices" disabled={disabled}>
    <legend>Matchmaking preference *</legend>
    <p id={id + "-help"}>Choose one. You can change this preference in your applicant portal. Photo and contact-sharing permissions are separate.</p>
    {matchmakingOptions.map(option => <label key={option.value} className="matchmaking-choice">
      <input type="radio" name={id} value={option.value} checked={value === option.value}
        required aria-describedby={id + "-help"} onChange={() => onChange(option.value)} />
      <span>{option.label}</span>
    </label>)}
  </fieldset>;
}

type SavedPreference = {
  matchmakingPreference?: MatchmakingPreference | null;
  matchmakingPreferenceUpdatedAt?: number | null;
};

export function MatchmakingPreferenceControl({ initial }: { initial: SavedPreference }) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState<MatchmakingPreference | "">(initial.matchmakingPreference ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);

  async function reload() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/applicant/profile", { cache: "no-store" });
      if (response.status === 401) { window.location.assign("/login"); return; }
      const payload = await response.json();
      if (!response.ok) throw new Error("Could not reload your preference. Please try again.");
      const latest: SavedPreference = payload.registration;
      setSaved(latest); setDraft(latest.matchmakingPreference ?? ""); setConflict(false);
      setMessage("Latest saved preference loaded. Review your choice before saving again.");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not reload your preference."); }
    finally { setBusy(false); }
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || busy || conflict) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/applicant/matchmaking-preference", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchmakingPreference: draft, expectedUpdatedAt: saved.matchmakingPreferenceUpdatedAt ?? null }),
      });
      if (response.status === 401) { window.location.assign("/login"); return; }
      const payload = await response.json();
      if (response.status === 409) {
        setConflict(true);
        throw new Error("Your preference changed in another session. Reload the saved preference, then review and save your choice again. Nothing was overwritten.");
      }
      if (!response.ok) throw new Error(payload.error || "Your preference could not be saved. Please try again.");
      setSaved(payload); setDraft(payload.matchmakingPreference);
      setMessage("Matchmaking preference saved.");
    } catch (err) { setError(err instanceof Error ? err.message : "Your preference could not be saved."); }
    finally { setBusy(false); }
  }

  return <section id="matchmaking-preference" className="panel applicant-section">
    <div className="panel-head"><div><h3>Matchmaking preference</h3><p>Manage whether the team may consider you for matches beyond events.</p></div></div>
    <form className="profile-form" onSubmit={save}>
      <p><strong>Saved preference:</strong> {matchmakingPreferenceLabel(saved.matchmakingPreference)}</p>
      <MatchmakingChoices value={draft} onChange={value => { setDraft(value); setMessage(""); }} disabled={busy || conflict} />
      <p>To withdraw permission for matchmaking beyond events, choose in-person events only and save. You can opt in again here at any time.</p>
      {error && <p className="notice error" role="alert">{error}</p>}
      {message && <p className="notice success" role="status">{message}</p>}
      <div className="profile-actions">
        {conflict ? <button type="button" className="btn" disabled={busy} onClick={reload}>{busy ? "Reloading…" : "Reload saved preference"}</button> :
          <button type="submit" className="btn btn-primary" disabled={busy || !draft || draft === saved.matchmakingPreference}>{busy ? "Saving…" : "Save matchmaking preference"}</button>}
      </div>
    </form>
  </section>;
}
