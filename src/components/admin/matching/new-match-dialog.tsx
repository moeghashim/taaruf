"use client";
import { refreshAdminData } from "@/components/admin/hooks/use-admin-transport";

import { useRef, useState } from "react";
import { useAdminQuery as useQuery } from "@/components/admin/hooks/use-admin-transport";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Ico } from "@/components/admin/primitives/icons";

export function NewMatchDialog() {
  const [open, setOpen] = useState(false);
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><button type="button" className="btn btn-primary" aria-label="New match">{Ico.plus}<span>New match</span></button></DialogTrigger>
    <DialogContent data-admin><DialogTitle>New match</DialogTitle><DialogDescription style={{ color: "var(--mute)" }}>Save a private draft for admin review. Applicants cannot see it and no notifications are sent. Presenting background matches is not available yet: both applicants must opt in before a future presentation step.</DialogDescription>
      {open && <NewMatchForm onCreated={() => setOpen(false)} />}
    </DialogContent>
  </Dialog>;
}

function NewMatchForm({ onCreated }: { onCreated: () => void }) {
  const registrations = useQuery("registrations.getAll");
  const router = useRouter();
  const [male, setMale] = useState("");
  const [female, setFemale] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const eligible = (registrations ?? []).filter(r => r.status === "approved" && r.profileCompletionStatus === "completed" && (r.searchStatus ?? "active") === "active" && !r.activeMatchId);
  if (registrations === undefined) return <p role="status">Loading applicants…</p>;
  return <form style={{ display: "grid", gap: 16, minWidth: 0 }} onSubmit={async event => {
    event.preventDefault();
    if (submitting.current || !male || !female) return;
    submitting.current = true;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/admin/create-match", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ maleRegistrationId: male, femaleRegistrationId: female, adminNotes: notes }) });
      const result = await response.json();
      if (response.ok) refreshAdminData();
      if (!response.ok || typeof result.matchId !== "string") throw new Error(result.error || "Unable to create match. Please try again.");
      router.push("/admin/workbench?match=" + encodeURIComponent(result.matchId));
      onCreated();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to create match. Please try again."); }
    finally { submitting.current = false; setBusy(false); }
  }}>
    {(["male", "female"] as const).map(gender => <label key={gender} style={{ display: "grid", gap: 6, minWidth: 0 }}>
      {gender === "male" ? "Male applicant" : "Female applicant"}
      <select aria-label={gender === "male" ? "Male applicant" : "Female applicant"} required disabled={busy} value={gender === "male" ? male : female} onChange={e => (gender === "male" ? setMale : setFemale)(e.target.value)} style={{ width: "100%", minWidth: 0, padding: 10, border: "1px solid var(--line)", borderRadius: 6, fontSize: 16 }}>
        <option value="">Select an applicant</option>
        {eligible.filter(r => r.gender === gender).map(r => <option key={r._id} value={r._id}>#{r.publicApplicantNumber ?? "—"} {r.name}</option>)}
      </select>
      {!eligible.some(r => r.gender === gender) && <small>No eligible {gender} applicants. Profiles must be approved, complete, actively searching, and not in an active match.</small>}
    </label>)}
    <label style={{ display: "grid", gap: 6 }}>Admin notes (optional)<textarea maxLength={2000} disabled={busy} value={notes} onChange={e => setNotes(e.target.value)} style={{ width: "100%", padding: 10, border: "1px solid var(--line)", borderRadius: 6, fontSize: 16 }} /></label>
    {error && <p role="alert">{error}</p>}
    <button type="submit" className="btn btn-primary" disabled={busy || !male || !female}>{busy ? "Saving…" : "Save draft"}</button>
  </form>;
}
