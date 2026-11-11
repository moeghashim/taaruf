"use client";
import { ChangeEmailForm } from "./change-email-form";
import { interestLifecycle, isArchivedInterest } from "@/lib/interest-lifecycle";
import { refreshAdminData } from "@/components/admin/hooks/use-admin-transport";
import { formatEducation } from "@/lib/education";

import { ArchiveParticipant } from "@/components/archive-participant";
import { useEffect, useState } from "react";
import { useAdminQuery as useQuery } from "@/components/admin/hooks/use-admin-transport";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Pill, StatusPill } from "@/components/admin/primitives/status-pill";
import { FactList, type Fact } from "@/components/admin/primitives/fact-list";
import type { RegistrationDoc } from "@/components/admin/hooks/use-registrations";

type Props = {
  profile: RegistrationDoc & { archivedAt?: number };
  registrationNumber?: number;
  onUpdateNotes: (id: string, notes: string) => Promise<unknown>;
  onUpdateStatus: (id: string, status: "approved" | "rejected") => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
};

function formatDate(timestamp?: number) {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function currentText(primary?: string, fallback?: string) {
  return primary?.trim() || fallback?.trim() || "";
}

function currentLookingFor(profile: RegistrationDoc) {
  const requirements = [
    profile.spouseRequirement1,
    profile.spouseRequirement2,
    profile.spouseRequirement3,
  ]
    .map((requirement) => requirement?.trim())
    .filter((requirement): requirement is string => Boolean(requirement));

  return requirements.length ? requirements.join(", ") : profile.lookingFor?.trim() || "";
}


export function ProfileDetail(props: Props) {
  return <ProfileDetailBody key={props.profile._id} {...props} />;
}

function ProfileDetailBody({
  profile,
  registrationNumber,
  onUpdateNotes,
  onUpdateStatus,
  onDelete,
  onClose,
  onDirtyChange,
}: Props) {
  const [localArchive, setLocalArchive] = useState<{ id: string; at: number | null } | null>(null);
  const archivedAt = localArchive?.id === profile._id ? localArchive.at : profile.archivedAt;
  const archived = archivedAt != null;
  const [actionError, setActionError] = useState<string | null>(null);
  const [failedPhotos, setFailedPhotos] = useState<string[]>([]);
  const eventHistory = useQuery("events.getByRegistration", {
    registrationId: profile._id as Id<"registrations">,
  });
  const interestHistory = useQuery("interests.getByRegistration", {
    registrationId: profile._id as Id<"registrations">,
  });
  const [notes, setNotes] = useState(profile.adminNotes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [busyAction, setBusyAction] = useState<null | "approve" | "reject" | "revoke" | "delete">(null);
  const about = currentText(profile.shareableBio, profile.describeYourself);
  const lookingFor = currentLookingFor(profile);
  const outboundInterests = interestHistory?.outbound ?? [];
  const inboundInterests = interestHistory?.inbound ?? [];



  const [savedNotes, setSavedNotes] = useState(profile.adminNotes ?? "");
  const [emailDirty, setEmailDirty] = useState(false);
  const dirty = notes !== savedNotes;
  // Follow subscriptions while clean; never replace an unsaved local draft.
  useEffect(() => {
    if (dirty || savingNotes) return;
    const incoming = profile.adminNotes ?? "";
    setNotes(incoming);
    setSavedNotes(incoming);
  }, [profile.adminNotes, dirty, savingNotes]);
  useEffect(() => { onDirtyChange?.(dirty || emailDirty || savingNotes || busyAction !== null); }, [dirty, emailDirty, savingNotes, busyAction, onDirtyChange]);
  useEffect(() => {
    if (!dirty && !emailDirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, emailDirty]);


  const facts: Fact[] = [
    { label: "Applicant #", value: registrationNumber ?? "—" },
    { label: "Age", value: profile.age },
    { label: "Gender", value: profile.gender },
    { label: "Ethnicity", value: profile.ethnicity?.trim() ? profile.ethnicity : "Not provided" },
    { label: "Prayer commitment", value: profile.prayerCommitment?.replace(/_/g, " ") || "—" },
    { label: "Hijab", value: profile.hijabResponse?.replace(/_/g, " ") || "—" },
    { label: "Photo sharing permission", value: profile.photoSharingPermission?.replace(/_/g, " ") || "—" },
    { label: "Profile completion", value: profile.profileCompletionStatus?.replace(/_/g, " ") || "not started" },
    { label: "Marital status", value: profile.maritalStatus || "—" },
    { label: "Education", value: formatEducation(profile.education) },
    { label: "Occupation", value: profile.job || "—" },
    { label: "Email", value: profile.email },
    { label: "Phone", value: profile.phone || "—" },
    { label: "Registered", value: formatDate(profile._creationTime) },
  ];

  const saveNotes = async () => {
    setSavingNotes(true);
    setActionError(null);
    try {
      await onUpdateNotes(profile._id, notes);
      setSavedNotes(notes);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to save notes. Your draft is preserved; try again.");
    } finally {
      setSavingNotes(false);
    }
  };

  const handleStatus = async (status: "approved" | "rejected") => {
    setBusyAction(status === "approved" ? "approve" : "reject");
    try {
      await onUpdateStatus(profile._id, status);
    } catch (error) { setActionError(error instanceof Error ? error.message : "Unable to update profile approval");
    } finally {
      setBusyAction(null);
    }
  };

  const revokeApproval = async () => {
    if (!window.confirm("Revoke approval and return to pending review? Already-shared contacts cannot be recalled.")) return;
    setBusyAction("revoke"); setActionError(null);
    try {
      const response = await fetch("/api/admin/revoke-approval", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ registrationId: profile._id }) });
      const result = await response.json();
      if (response.ok) refreshAdminData();
      if (!response.ok) throw new Error(result.error);
    } catch (error) { setActionError(error instanceof Error ? error.message : "Unable to revoke approval"); }
    finally { setBusyAction(null); }
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete this registration? This cannot be undone.")) return;
    setBusyAction("delete");
    try {
      await onDelete(profile._id);
      onClose();
    } catch (error) { setActionError(error instanceof Error ? error.message : "Unable to delete profile");
    } finally {
      setBusyAction(null);
    }
  };

  const sectionHeading = (text: string) => (
    <h4
      style={{
        fontSize: 10,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: "var(--mute)",
        marginBottom: 10,
        fontWeight: 500,
      }}
    >
      {text}
    </h4>
  );

  return (
    <div style={{ padding: 20 }}>
      <ArchiveParticipant key={profile._id} archivedAt={archivedAt} lastRestoredArchivedAt={profile.lastRestoredArchivedAt} registrationId={profile._id} name={profile.name} onArchived={at => { setLocalArchive({ id: profile._id, at }); refreshAdminData(); }} onRestored={() => { setLocalArchive({ id: profile._id, at: null }); refreshAdminData(); }} />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
        <StatusPill status={profile.status} />
        {profile.paymentStatus && <StatusPill status={profile.paymentStatus} />}
      </div>

      {profile.imageUrls?.length ? (
        <>
          {sectionHeading("Photos")}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
              gap: 10,
              marginBottom: 24,
            }}
          >
            {profile.imageUrls.map((imageUrl, index) => failedPhotos.includes(imageUrl) ? <p key={imageUrl}>Photo {index + 1} could not load. Please request a re-upload.</p> : (
              <img
                key={`${profile._id}-photo-${index}`}
                src={imageUrl}
                onError={() => setFailedPhotos(urls => [...urls, imageUrl])}
                alt={`${profile.name} photo ${index + 1}`}
                style={{
                  width: "100%",
                  aspectRatio: "4 / 5",
                  objectFit: "cover",
                  borderRadius: 8,
                  border: "1px solid var(--line)",
                  background: "var(--bg-tint)",
                }}
              />
            ))}
          </div>
        </>
      ) : <p role="status">{profile.imageStorageIds?.length ? "Uploaded photos are unavailable. Please request a re-upload." : "No photos uploaded for this profile."}</p>}

      {sectionHeading("Profile facts")}
      <div style={{ marginBottom: 24 }}>
        <FactList facts={facts} />
      </div>

      <ChangeEmailForm registrationId={profile._id} email={profile.email} onDirtyChange={setEmailDirty} />

      {sectionHeading("Interest snapshot")}
      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          marginBottom: 24,
        }}
      >
        <div style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 12, background: "var(--bg-tint)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
            <strong style={{ fontSize: 13 }}>Outbound interests</strong>
            <Pill tone="plain">{outboundInterests.length}</Pill>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Pill tone="plain">Pending review {outboundInterests.filter(interest => !isArchivedInterest(interest)).length}</Pill>
            <Pill tone="plain">Released / closed {outboundInterests.filter(isArchivedInterest).length}</Pill>
          </div>
        </div>
        <div style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 12, background: "var(--bg-tint)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
            <strong style={{ fontSize: 13 }}>Inbound interests</strong>
            <Pill tone="plain">{inboundInterests.length}</Pill>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Pill tone="plain">Pending review {inboundInterests.filter(interest => !isArchivedInterest(interest)).length}</Pill>
            <Pill tone="plain">Released / closed {inboundInterests.filter(isArchivedInterest).length}</Pill>
          </div>
        </div>
      </div>

      {about && (
        <>
          {sectionHeading("About")}
          <div
            style={{
              padding: 14,
              background: "var(--bg-tint)",
              borderRadius: 6,
              fontFamily: "var(--font-admin-serif)",
              fontStyle: "italic",
              fontSize: 15,
              color: "var(--ink-2)",
              lineHeight: 1.5,
              marginBottom: 24,
              whiteSpace: "pre-wrap",
            }}
          >
            “{about}”
          </div>
        </>
      )}

      {lookingFor && (
        <>
          {sectionHeading("Looking for")}
          <div
            style={{
              padding: 14,
              background: "var(--bg-tint)",
              borderRadius: 6,
              fontFamily: "var(--font-admin-serif)",
              fontStyle: "italic",
              fontSize: 15,
              color: "var(--ink-2)",
              lineHeight: 1.5,
              marginBottom: 24,
              whiteSpace: "pre-wrap",
            }}
          >
            “{lookingFor}”
          </div>
        </>
      )}

      {sectionHeading("Events")}
      <div style={{ display: "grid", gap: 8, marginBottom: 24 }}>
        {eventHistory === undefined ? (
          <div style={{ color: "var(--mute)", fontSize: 12 }}>Loading events...</div>
        ) : eventHistory.length ? (
          eventHistory.map((row) => (
            <div
              key={row._id}
              style={{
                border: "1px solid var(--line)",
                borderRadius: 6,
                padding: 10,
                display: "grid",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <strong style={{ fontSize: 13 }}>{row.event?.title ?? "Event"}</strong>
                <span className="mono" style={{ color: "var(--mute)", fontSize: 11 }}>
                  {formatDate(row.event?.startsAt)}
                </span>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <StatusPill status={row.registrationStatus} />
                <StatusPill status={row.attendanceStatus} />
                <Pill tone={row.eligibilityStatus === "approved_member" ? "green" : "gold"}>
                  {row.eligibilityStatus.replace(/_/g, " ")}
                </Pill>
              </div>
            </div>
          ))
        ) : (
          <div style={{ color: "var(--mute)", fontSize: 12 }}>No event history yet.</div>
        )}
      </div>

      {sectionHeading("Outbound interests")}
      <div style={{ display: "grid", gap: 8, marginBottom: 24 }}>
        {interestHistory === undefined ? (
          <div style={{ color: "var(--mute)", fontSize: 12 }}>Loading interests...</div>
        ) : outboundInterests.length ? (
          outboundInterests.map((interest) => (
            <div
              key={interest._id}
              style={{ border: "1px solid var(--line)", borderRadius: 6, padding: 10, display: "grid", gap: 6 }}
            >
              <strong style={{ fontSize: 13 }}>{interest.toRegistration?.name ?? "Unknown"}</strong>
              <div style={{ color: "var(--mute)", fontSize: 12 }}>{interest.toRegistration?.email ?? "—"}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Pill tone="plain">{interestLifecycle(interest)}</Pill>
                {interest.rank ? <Pill tone="plain">Rank {interest.rank}</Pill> : null}
                <Pill tone="plain">{interest.source.replace(/_/g, " ")}</Pill>
                {interest.matchId ? <Pill tone="green">Linked to match</Pill> : null}
              </div>
            </div>
          ))
        ) : (
          <div style={{ color: "var(--mute)", fontSize: 12 }}>No outbound interests recorded yet.</div>
        )}
      </div>

      {sectionHeading("Inbound interests")}
      <div style={{ display: "grid", gap: 8, marginBottom: 24 }}>
        {interestHistory === undefined ? (
          <div style={{ color: "var(--mute)", fontSize: 12 }}>Loading interests...</div>
        ) : inboundInterests.length ? (
          inboundInterests.map((interest) => (
            <div
              key={interest._id}
              style={{ border: "1px solid var(--line)", borderRadius: 6, padding: 10, display: "grid", gap: 6 }}
            >
              <strong style={{ fontSize: 13 }}>{interest.fromRegistration?.name ?? "Unknown"}</strong>
              <div style={{ color: "var(--mute)", fontSize: 12 }}>{interest.fromRegistration?.email ?? "—"}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Pill tone="plain">{interestLifecycle(interest)}</Pill>
                {interest.rank ? <Pill tone="plain">Their rank {interest.rank}</Pill> : null}
                <Pill tone="plain">{interest.visibility.replace(/_/g, " ")}</Pill>
                {interest.matchId ? <Pill tone="green">Linked to match</Pill> : null}
              </div>
            </div>
          ))
        ) : (
          <div style={{ color: "var(--mute)", fontSize: 12 }}>No inbound interests recorded yet.</div>
        )}
      </div>

      {profile.applicantNotesToAdmin && <><h4>Applicant notes to admin</h4><p style={{ whiteSpace: "pre-wrap" }}>{profile.applicantNotesToAdmin}</p></>}
      {sectionHeading("Admin notes")}
      <textarea
        aria-label="Admin notes"
        rows={5}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Private notes about this member…"
        style={{
          width: "100%",
          padding: 12,
          border: "1px solid var(--line)",
          borderRadius: 6,
          font: "inherit",
          fontSize: 13,
          resize: "vertical",
          marginBottom: 8,
        }}
      />
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <button
          className="btn btn-sm"
          onClick={saveNotes}
          disabled={savingNotes || !dirty}
        >
          {savingNotes ? "Saving…" : "Save notes"}
        </button>
      </div>

      <p role="status">{dirty ? "Unsaved notes" : "Notes saved"}</p>
      <h4>Global profile approval</h4>
      <p>These actions affect the member profile, not event registration or capacity. Manage event acceptance in the roster.</p>
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          paddingTop: 16,
          borderTop: "1px solid var(--line-2)",
        }}
      >
        {actionError && <p role="alert">{actionError}</p>}
        {!archived && profile.status === "approved" && <button className="btn" onClick={revokeApproval} disabled={busyAction !== null}>{busyAction === "revoke" ? "Revoking…" : "Revoke profile approval"}</button>}
        {!archived && profile.status === "pending" && (
          <>
            <button
              className="btn btn-primary"
              onClick={() => handleStatus("approved")}
              disabled={busyAction !== null}
            >
              {busyAction === "approve" ? "Approving…" : "Approve profile"}
            </button>
            <button
              className="btn"
              onClick={() => handleStatus("rejected")}
              disabled={busyAction !== null}
              style={{ color: "var(--rose)" }}
            >
              {busyAction === "reject" ? "Rejecting…" : "Reject profile"}
            </button>
          </>
        )}
        <button
          className="btn btn-ghost"
          onClick={handleDelete}
          disabled={busyAction !== null}
          style={{ color: "var(--rose)", marginLeft: "auto" }}
        >
          {busyAction === "delete" ? "Deleting…" : "Delete profile"}
        </button>
      </div>
    </div>
  );
}
