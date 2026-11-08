"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { refreshAdminData } from "@/components/admin/hooks/use-admin-transport";

type Delivery = { _id: string; recipientId: string; kind: string; status: string; attempts: number; error?: string };
async function request(body: Record<string, unknown>) {
  const response = await fetch("/api/admin/female-review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Unable to update review.");
  return result;
}
export function FemaleWorkflowActions({ interestId, state, compact = false }: { interestId: string; state: string; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [url, setUrl] = useState("");
  async function act(action: string) {
    if (busy) return;
    if (action === "release" && !window.confirm("Give final admin approval and release contacts in both applicant portals?")) return;
    if (action === "revoke" && !window.confirm("Permanently revoke this review?")) return;
    setBusy(true); setMessage("");
    try {
      const result = await request({ action, interestId });
      setUrl(result.reviewUrl || "");
      setMessage(action === "create" ? "Review available in the brother’s portal. No email sent." : action === "release" ? "Contacts released. Portal notification emails queued for both applicants." : "Review revoked.");
      refreshAdminData();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to update review."); }
    finally { setBusy(false); }
  }
  return <div style={{ display: "grid", gap: 8 }}>
    <span>{state.replaceAll("_", " ")}</span>
    <div className="action-row">
      {state === "private_documented" && <button type="button" className={compact ? "btn btn-sm btn-primary" : "btn btn-primary"} disabled={busy} onClick={() => void act("create")}>{busy ? "Creating…" : "CREATE REVIEW LINK"}</button>}
      {state === "awaiting_brother_review" && <button type="button" className="btn" disabled={busy} onClick={() => void act("create")}>Reissue review link</button>}
      {state === "pending_admin_approval" && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void act("release")}>{busy ? "Approving…" : "FINAL ADMIN APPROVAL"}</button>}
      {["awaiting_brother_review", "awaiting_sister_confirmation"].includes(state) && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void act("revoke")}>Revoke review</button>}
    </div>
    {url && <label className="field">Recipient-specific review link<input aria-label="Recipient-specific review link" readOnly value={typeof window === "undefined" ? url : window.location.origin + url} onFocus={event => event.target.select()} /><span>Only the intended brother can open this link after signing in.</span></label>}
    {message && <p role="status">{message}</p>}
  </div>;
}
export function FemaleWorkflowOutbox() {
  const [rows, setRows] = useState<Delivery[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"failed" | "history">("failed");
  const [cursor, setCursor] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const listRequest = useRef(0);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async (next: string | null = null) => {
    const requestId = ++listRequest.current;
    setLoading(true); setError("");
    if (!next) { setRows([]); setCursor(null); setDone(false); }
    try {
      const result = await request({ action: "deliveries", view, cursor: next });
      if (requestId !== listRequest.current) return;
      setRows(previous => next ? [...previous, ...result.page.filter((item: Delivery) => !previous.some(row => row._id === item._id))] : result.page);
      setCursor(result.continueCursor); setDone(result.isDone);
    }
    catch (error) { if (requestId === listRequest.current) setError(error instanceof Error ? error.message : "Unable to load email delivery."); }
    finally { if (requestId === listRequest.current) setLoading(false); }
  }, [view]);
  useEffect(() => { void load(); }, [load]);
  async function retry(deliveryId: string) {
    setBusy(deliveryId);
    try { await request({ action: "retry", deliveryId }); await load(); }
    catch (error) { setError(error instanceof Error ? error.message : "Retry failed."); }
    finally { setBusy(null); }
  }
  return <section className="panel" aria-label="Review email delivery">
    <div className="panel-head"><div><h3>Review email delivery</h3><p>Each recipient has a separate delivery record. Retrying does not repeat the approval.</p></div><button className="btn" type="button" disabled={busy !== null || loading} onClick={() => void load()}>Refresh</button></div>
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <label>Delivery view <select aria-label="Delivery view" value={view} disabled={busy !== null || loading} onChange={event => setView(event.target.value as "failed" | "history")}><option value="failed">Failed deliveries</option><option value="history">All delivery history</option></select></label>
      {error && <p className="notice error" role="alert">{error} Refresh or try Load more again. Non-retryable failures remain available in this history for manual reconciliation.</p>}
      {loading ? <p role="status">Loading deliveries…</p> : rows.length === 0 ? <p>{done ? (view === "failed" ? "No failed review emails." : "No review emails queued.") : "No deliveries in this page. Load more to continue."}</p> : rows.map(row => <div key={row._id} style={{ borderBottom: "1px solid var(--line)", paddingBottom: 12 }}>
        <p><strong>{row.kind.replaceAll("_", " ")}</strong> · {row.status} · {row.attempts} attempts</p><p>Recipient record: {row.recipientId}</p>
        {row.error && <p className="notice error">{row.error}</p>}
        {row.status === "failed" && <button type="button" className="btn" disabled={busy !== null} onClick={() => void retry(row._id)}>{busy === row._id ? "Queueing…" : "Retry email"}</button>}
      </div>)}
      {!done && <button type="button" className="btn" disabled={busy !== null || loading} onClick={() => void load(cursor)}>Load more deliveries</button>}
    </div>
  </section>;
}
