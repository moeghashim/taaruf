"use client";
import { useEffect, useState } from "react";
import { refreshAdminData } from "@/components/admin/hooks/use-admin-transport";

export function ChangeEmailForm({ registrationId, email, onDirtyChange }: { registrationId: string; email: string; onDirtyChange?: (dirty: boolean) => void }) {
  const [editing, setEditing] = useState(false);
  const [expected, setExpected] = useState(email);
  const [next, setNext] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  useEffect(() => { onDirtyChange?.(editing || busy); }, [editing, busy, onDirtyChange]);
  if (!editing) return <div style={{ marginBottom: 24 }}><button type="button" className="btn" onClick={() => { setExpected(email); setNext(""); setReason(""); setConfirmed(false); setError(""); setEditing(true); }}>Change email</button>{saved && <p role="status">Email changed to {saved}. Ask the member to sign in again. No email was sent.</p>}</div>;
  return <form style={{ display: "grid", gap: 12, marginBottom: 24 }} onSubmit={async event => {
    event.preventDefault();
    if (busy || !confirmed) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/change-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ registrationId, expectedOldEmail: expected, newEmail: next, reason }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to change email. Refresh before retrying.");
      setSaved(result.email); setEditing(false); refreshAdminData();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to change email. Refresh before retrying."); }
    finally { setBusy(false); }
  }}>
    <h3>Change sign-in email</h3>
    <p style={{ overflowWrap: "anywhere" }}>Current email: {expected}</p>
    <label style={{ display: "grid", gap: 6 }}>New email<input style={{ width: "100%", padding: 10, border: "1px solid var(--line)", borderRadius: 6, background: "var(--bg)" }} type="email" autoComplete="off" required maxLength={254} value={next} disabled={busy} onChange={e => { setNext(e.target.value); setConfirmed(false); }} /></label>
    <label style={{ display: "grid", gap: 6 }}>Reason for change<textarea style={{ width: "100%", padding: 10, border: "1px solid var(--line)", borderRadius: 6, background: "var(--bg)" }} required minLength={5} maxLength={500} value={reason} disabled={busy} onChange={e => setReason(e.target.value)} /></label>
    <p>This signs the member out and invalidates existing sign-in and profile-edit links. Their profile, status and event history stay unchanged. No email is sent.</p>
    <label><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} /> I verified the member’s consent and the new address.</label>
    {error && <p role="alert">{error}</p>}
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}><button className="btn" type="submit" disabled={busy || !confirmed}>{busy ? "Changing email…" : "Confirm email change"}</button><button className="btn" type="button" disabled={busy} onClick={() => setEditing(false)}>Cancel</button></div>
  </form>;
}
