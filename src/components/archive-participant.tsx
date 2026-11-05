"use client";

import { useRef, useState } from "react";
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function ArchiveParticipant({ archivedAt, registrationId, name, onArchived }: {
  archivedAt?: number | null;
  registrationId?: string;
  name?: string;
  onArchived?: (archivedAt: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const archived = archivedAt != null || done;

  async function archive() {
    if (inFlight.current || archived || conflict) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(registrationId ? "/api/admin/archive" : "/api/applicant/archive", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(registrationId ? { registrationId } : {}), expectedArchivedAt: archivedAt ?? null, confirm: true }),
      });
      const payload = await response.json();
      if (response.status === 409) setConflict(true);
      if (!response.ok) throw new Error(payload.error || "Could not archive this profile. Please try again.");
      setDone(true); setOpen(false);
      onArchived?.(typeof payload.archivedAt === "number" ? payload.archivedAt : Date.now());
    } catch (err) { setError(err instanceof Error ? err.message : "Could not archive this profile. Please try again."); }
    finally { inFlight.current = false; setBusy(false); }
  }

  return <section className="panel applicant-section" aria-label="Participant archive">
    <div className="panel-head"><div>
      <h3>{archived ? "Participant archived" : "Archive participant"}</h3>
      <p>{archived ? "Active matching is stopped. New event registration and matchmaking are unavailable." : "Leave active matching and upcoming events without deleting your records."}</p>
    </div></div>
    <div style={{ padding: 20 }}>
      {archived ? <p role="status">History and payment receipts are preserved. Archiving does not issue a refund. Reactivation is not available here.</p> :
        <Dialog open={open} onOpenChange={value => { if (!busy) { setOpen(value); setError(""); } }}>
          <DialogTrigger asChild><button type="button" className="btn">Archive participant</button></DialogTrigger>
          <DialogContent onOpenAutoFocus={event => { event.preventDefault(); cancel.current?.focus(); }}>
            <DialogTitle>Archive {name ? name : "your participant profile"}?</DialogTitle>
            <DialogDescription className="text-foreground">This stops active matching, active workflows, and queued matching communications. Upcoming event registrations and waitlist entries will be cancelled.</DialogDescription>
            <p className="text-sm">Profile history and payment receipts are preserved. No refund is issued automatically. Already-sent messages and shared contacts cannot be recalled. You cannot reactivate from this screen.</p>
            {error && <p role="alert" className="text-sm">{error}</p>}
            <div className="flex flex-wrap justify-end gap-3">
              <button ref={cancel} type="button" className="rounded-md border px-4 py-2 text-sm focus-visible:outline-2" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
              {conflict ? <button type="button" className="rounded-md border px-4 py-2 text-sm" onClick={() => window.location.reload()}>Reload profile</button> :
                <button type="button" className="rounded-md bg-foreground px-4 py-2 text-sm text-background disabled:opacity-50 focus-visible:outline-2" disabled={busy} onClick={archive}>{busy ? "Archiving…" : "Confirm archive"}</button>}
            </div>
          </DialogContent>
        </Dialog>}
    </div>
  </section>;
}
