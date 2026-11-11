"use client";
import { useState } from "react";
type Preview = { fingerprint: string; count: number; submissions: number; shares: number; deliveries: number; warnings?: string[] };
export function ResetTestPair() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [operationKey, setOperationKey] = useState("");
  async function run(action: "preview" | "reset") {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/reset-test-pair", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action === "preview" ? { action } : { action, expectedFingerprint: preview?.fingerprint, operationKey, reason, confirmPair: "219-220" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (action === "preview") { setPreview(data); setConfirmed(false); setOperationKey(crypto.randomUUID()); }
      else { setMessage((data.alreadyReset ? "Nothing to reset. The pair is already reset." : "Test pair reset. Both applicants can submit again through the normal flow, subject to normal eligibility and remaining slots.") + (data.warnings?.length ? " " + data.warnings.join(" ") : "")); setPreview(null); setConfirmed(false); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Request failed. Retry or refresh the preview."); }
    finally { setBusy(false); }
  }
  return <section className="panel" aria-labelledby="reset-pair-title">
    <div className="panel-head"><h3 id="reset-pair-title">Reset test pair</h3></div>
    <div style={{ padding: 20, display: "grid", gap: 16, maxWidth: 720 }}>
      <p>Only applicants <strong>#219 ↔ #220</strong>, in both directions. Retires their pair submissions, reviews and share access; retires old-cycle delivery jobs regardless of email status and restores only the slots those submissions used.</p>
      <p style={{ color: "var(--ink-2)" }}>Profiles, check-ins, event registrations, other applicants’ interactions and original history stay intact. No approvals, contact or photo consent are granted. Previously disclosed information cannot be recalled. Notification emails already being sent may still arrive; their retired links will not restore access.</p>
      <div><button className="btn" disabled={busy} onClick={() => run("preview")}>{busy ? "Working…" : preview ? "Refresh preview" : "Preview reset"}</button></div>
      {preview && (preview.count === 0 ? <p>Nothing to reset for this pair.</p> : <>
        <p>{preview.submissions} submissions · {preview.shares} share grants · {preview.deliveries} delivery records to retire</p>
        {preview.warnings?.map(warning => <p key={warning} role="note">{warning}</p>)}
        <label htmlFor="pair-reset-reason">Reason (10–500 characters)</label>
        <textarea id="pair-reset-reason" value={reason} maxLength={500} rows={3} onChange={e => setReason(e.target.value)} disabled={busy} style={{ width: "100%", padding: 12, border: "1px solid var(--line)", borderRadius: 6, background: "var(--panel)", color: "var(--ink)" }} />
        <label style={{ display: "flex", alignItems: "start", gap: 10 }}><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} />I confirm that only the test pair #219 and #220 should be reset. History will be retained.</label>
        <div><button className="btn btn-primary" disabled={busy || !confirmed || reason.trim().length < 10} onClick={() => run("reset")}>Reset #219 ↔ #220</button></div>
      </>)}
      {message && <p role="status" aria-live="polite">{message}</p>}
    </div>
  </section>;
}
