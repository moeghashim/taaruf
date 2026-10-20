"use client";
import { useEffect, useState } from "react";
type Applicant = { registrationId: string; applicantNumber: number | null; name: string; gender: string };
type Sheet = { events: { eventId: string; title: string; startsAt: number }[]; attendees: Applicant[]; total: number; candidates: Applicant[] };
export default function EventAttendeesPage() {
  const [eventId, setEventId] = useState("");
  const [search, setSearch] = useState("");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/admin/event-attendees?" + new URLSearchParams({ eventId, search }), { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setSheet(data); setError("");
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Unable to load"); }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [eventId, search, revision]);
  async function update(applicant: Applicant, attending: boolean) {
    if (!attending && !confirm("Remove " + applicant.name + " from this event?")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/event-attendees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId, registrationId: applicant.registrationId, attending }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setRevision(value => value + 1);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to update"); }
    finally { setBusy(false); }
  }
  return <div className="space-y-6 p-6"><h1 className="text-3xl font-semibold">Event Attendees</h1>
    <label className="block">Event<select className="block border rounded p-2" value={eventId} onChange={e => { setEventId(e.target.value); setSheet(null); setSearch(""); }}><option value="">Select an event</option>{sheet?.events.map(event => <option key={event.eventId} value={event.eventId}>{event.title} — {new Date(event.startsAt).toLocaleDateString()}</option>)}</select></label>
    {error && <p role="alert">{error}</p>}
    {eventId && <><label className="block">Add attendee by applicant number or name<input className="block border rounded p-2" value={search} onChange={e => setSearch(e.target.value)} /></label>
      <ul>{sheet?.candidates.map(row => <li className="flex gap-4 py-2" key={row.registrationId}>#{row.applicantNumber ?? "—"} {row.name} · {row.gender}<button disabled={busy || sheet.attendees.some(a => a.registrationId === row.registrationId)} onClick={() => update(row, true)}>Add</button></li>)}</ul>
      <h2 className="text-xl">Attendance · {sheet?.total ?? 0}</h2>
      <ul>{sheet?.attendees.map(row => <li className="flex gap-4 border-b py-3" key={row.registrationId}>#{row.applicantNumber ?? "—"} {row.name} · {row.gender}<button disabled={busy} onClick={() => update(row, false)}>Remove</button></li>)}</ul>
    </>}
  </div>;
}
