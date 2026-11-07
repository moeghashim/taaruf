"use client";
import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
export function TestResetDialog({ selection, onClose, onSuccess }: { selection: { id: string; pair: string; event: string } | null; onClose: () => void; onSuccess: (message: string) => void; }) {
 const [reason, setReason] = useState("");
 const [confirmed, setConfirmed] = useState(false);
 const [busy, setBusy] = useState(false);
 const [message, setMessage] = useState("");
 const [done, setDone] = useState(false);
 const pending = useRef(false);
 async function submit() {
   if (!selection || pending.current) return;
   if (!confirmed) { setMessage("Confirm that this exact submission is test data."); return; }
   if (reason.trim().length < 10 || reason.length > 500) { setMessage("Please explain why this is test data in 10–500 characters. Your reason has been kept."); return; }
   pending.current = true; setBusy(true); setMessage("");
   try {
     const response = await fetch("/api/admin/interest-test-reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: selection.id, reason, confirmTest: true }), signal: AbortSignal.timeout(20000) });
     const result = await response.json().catch(() => null);
     if (!response.ok) throw new Error(result?.error || "The server could not confirm the reset. Your reason is kept. Please retry.");
     if (!result || typeof result.alreadyReset !== "boolean") throw new Error("Unexpected response. Refresh the list before retrying this same record.");
     const success = result.alreadyReset ? "This test submission was already reset. No additional slot was restored." : "Test submission reset. One event slot restored; audit retained.";
     setDone(true); setMessage(success); onSuccess(success);
   } catch (error) {
     setMessage(error instanceof Error && !["TypeError", "TimeoutError", "AbortError"].includes(error.name) ? error.message : "Connection interrupted. The reset may have completed. Refresh the list or retry this same record safely; no extra slot will be restored.");
   } finally { pending.current = false; setBusy(false); }
 }
 return <Dialog open={Boolean(selection)} onOpenChange={open => { if (!open && !pending.current) onClose(); }}>
   <DialogContent onInteractOutside={event => { if (busy) event.preventDefault(); }} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }}>
     <DialogTitle>Reset test submission</DialogTitle>
     <DialogDescription>Confirm one test record only. Real interests must not be reset.</DialogDescription>
     <p><strong>{selection?.pair}</strong><br />{selection?.event}</p>
     <p>This closes the workflow and its photo access, restores one event submission slot, and retains the audit. Linked history may require manual review.</p>
     {!done && <form onSubmit={event => { event.preventDefault(); void submit(); }} style={{ display: "grid", gap: 12 }}>
       <label>Reason (10–500 characters)<textarea autoFocus value={reason} onChange={event => setReason(event.target.value)} disabled={busy} maxLength={500} rows={3} style={{ width: "100%", padding: 10, border: "1px solid currentColor", borderRadius: 6, fontSize: 16 }} /></label>
       <label style={{ display: "flex", gap: 8, alignItems: "start" }}><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={busy} />I confirm this exact submission is test data.</label>
       {message && <p role="alert" style={{ margin: 0 }}>{message}</p>}
       <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", flexWrap: "wrap" }}><button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Resetting…" : "Confirm test reset"}</button></div>
     </form>}
     {done && <><p role="status">{message}</p><button className="btn" onClick={onClose}>Done</button></>}
   </DialogContent>
 </Dialog>;
}
