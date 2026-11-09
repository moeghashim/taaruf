"use client";

import { Component, useRef, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRegistrations } from "@/components/admin/hooks/use-registrations";
import { ProfileDetail } from "@/components/admin/profiles/profile-detail";

class ProfileErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div role="alert">Unable to load this profile. Close and reopen to retry.</div> : this.props.children;
  }
}

function ProfileContent({ registrationId, onClose, onDirtyChange }: {
  registrationId: string; onClose: () => void; onDirtyChange: (dirty: boolean) => void;
}) {
  // Reuse the same resolved photos, waitlist state and actions as Profiles.
  const data = useRegistrations();
  if (data.isLoading) return <p role="status">Loading profile…</p>;
  const profile = data.registrations.find(row => row._id === registrationId);
  if (!profile) return <p role="status">Profile unavailable. It may have been deleted. Return to the event roster.</p>;
  return <>
    <h3 style={{ padding: "16px 20px 0" }}>{profile.name} · Applicant #{profile.publicApplicantNumber ?? "—"}</h3>
    <ProfileDetail key={profile._id} profile={profile} registrationNumber={profile.publicApplicantNumber}
      isWaitlisted={data.waitlistIds.has(profile._id)} onUpdateNotes={data.actions.updateAdminNotes}
      onUpdateStatus={data.actions.updateStatus} onDelete={data.actions.deleteRegistration}
      onClose={onClose} onDirtyChange={onDirtyChange} />
  </>;
}

export function EventParticipantProfile({ registrationId, eventTitle, onClose }: {
  registrationId: string; eventTitle: string; onClose: () => void;
}) {
  const [dirty, setDirty] = useState(false);
  const returnFocus = useRef(typeof document === "undefined" ? null : document.activeElement as HTMLElement | null);
  function close() {
    if (dirty && !window.confirm("Unsaved notes or an action in progress. Close this profile and discard any unsaved notes?")) return;
    onClose();
  }
  return <Dialog.Root open onOpenChange={open => { if (!open) close(); }}>
    <Dialog.Portal>
      <div data-admin>
      <Dialog.Overlay className="backdrop open" />
      <Dialog.Content className="detail-pane open" onCloseAutoFocus={event => { event.preventDefault(); returnFocus.current?.focus(); }}>
        <div className="dp-head">
          <div><Dialog.Title>Participant profile</Dialog.Title>
            <Dialog.Description>{eventTitle} · Global member profile. Event registration stays in the roster.</Dialog.Description></div>
          <button type="button" className="btn btn-sm" onClick={close}>Back to event</button>
        </div>
        <div className="dp-body"><ProfileErrorBoundary>
          <ProfileContent registrationId={registrationId} onClose={onClose} onDirtyChange={setDirty} />
        </ProfileErrorBoundary></div>
      </Dialog.Content>
      </div>
    </Dialog.Portal>
  </Dialog.Root>;
}
