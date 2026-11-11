"use client";

import { useRef, useState } from "react";
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function ArchiveParticipant({ archivedAt, lastRestoredArchivedAt, registrationId, name, onArchived, onRestored }: {
  archivedAt?: number | null;
  lastRestoredArchivedAt?: number;
  registrationId?: string;
  name?: string;
  onArchived?: (archivedAt: number) => void;
  onRestored?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [restored, setRestored] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const archived = archivedAt != null;

  async function submit() {
    if (inFlight.current || conflict) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const action = archived ? "restore" : "archive";
      const response = await fetch(
        "/api/" + (registrationId ? "admin/" : "applicant/") + action, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...(registrationId ? { registrationId } : {}), expectedArchivedAt: archivedAt ?? null, ...(!archived && lastRestoredArchivedAt !== undefined ? {expectedRestoredArchivedAt: lastRestoredArchivedAt} : {}), confirm: true }),
        });
      const payload = await response.json();
      if (response.status === 409) setConflict(true);
      if (!response.ok) throw new Error(payload.error || "Could not update this profile. Please try again.");
      if (archived) {
        setRestored(true); onRestored?.();
      } else {
        if (typeof payload.archivedAt !== "number") {
          setConflict(true);
          throw new Error("The saved revision could not be verified. Reload the profile before trying again.");
        }
        setRestored(false); onArchived?.(payload.archivedAt);
      }
      setOpen(false);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not update this profile. Please try again."); }
    finally { inFlight.current = false; setBusy(false); }
  }

  return <section className="panel applicant-section" aria-label="Participant archive">
    <div className="panel-head"><div>
      <h3>{archived ? "Participant archived" : "Archive participant"}</h3>
      <p>{archived ? "Active matching is closed. New event registration and matchmaking are unavailable." : "Archiving cancels upcoming registrations and closes active matching without deleting your records."}</p>
    </div></div>
    <div style={{ padding: 20 }}>
      {archived && <p>History and payment receipts are preserved. Archiving does not issue a refund.</p>}
      {restored && !archived && <p role="status">Availability restored. Event bookings, closed matching, profile approval, photo access, and contact sharing have not been restored.</p>}
      <Dialog open={open} onOpenChange={value => { if (!busy) { setOpen(value); setError(""); } }}>
        <DialogTrigger asChild><button type="button" className="btn">{archived ? "Restore availability" : "Archive participant"}</button></DialogTrigger>
        <DialogContent onOpenAutoFocus={event => { event.preventDefault(); cancel.current?.focus(); }}>
          <DialogTitle>{archived ? "Restore availability for" : "Archive"} {name || "your participant profile"}?</DialogTitle>
          <DialogDescription className="text-foreground">{archived
            ? "Restore availability only. Future event registration and matching remain subject to normal eligibility checks."
            : "This closes active matching, active workflows, and queued matching communications. Upcoming event registrations and waitlist entries will be cancelled."}</DialogDescription>
          <p className="text-sm">{archived
            ? "This does not rebook events, reopen closed matching, approve the profile, or restore photo access or contact sharing. Register for future events separately."
            : "Profile history and payment receipts are preserved. No refund is issued automatically. Messages already sent or being delivered cannot be recalled. Previously shared contacts cannot be recalled. Restoring later restores availability only, not bookings or closed matching."}</p>
          {error && <p role="alert" className="text-sm">{error}</p>}
          <div className="flex flex-wrap justify-end gap-3">
            <button ref={cancel} type="button" className="rounded-md border px-4 py-2 text-sm focus-visible:outline-2" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
            {conflict ? <button type="button" className="rounded-md border px-4 py-2 text-sm" onClick={() => window.location.reload()}>Reload profile</button> :
              <button type="button" className="rounded-md bg-foreground px-4 py-2 text-sm text-background disabled:opacity-50 focus-visible:outline-2" disabled={busy} onClick={submit}>{busy ? (archived ? "Restoring…" : "Archiving…") : (archived ? "Confirm restore availability" : "Confirm archive")}</button>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  </section>;
}
