"use client";

import { useEffect, useState } from "react";
import { Pill, StatusPill } from "@/components/admin/primitives/status-pill";
import { FactList, type Fact } from "@/components/admin/primitives/fact-list";
import type { RegistrationDoc } from "@/components/admin/hooks/use-registrations";

type Props = {
  profile: RegistrationDoc;
  registrationNumber?: number;
  isWaitlisted: boolean;
  onUpdateNotes: (id: string, notes: string) => Promise<unknown>;
  onUpdateStatus: (id: string, status: "approved" | "rejected") => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  onClose: () => void;
};

function formatDate(timestamp?: number) {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Body of the detail pane drawer for a single registration. Renders
 * profile facts + applicant long-form text + an editable admin notes
 * field + the action bar (approve/reject/delete).
 */
export function ProfileDetail({
  profile,
  registrationNumber,
  isWaitlisted,
  onUpdateNotes,
  onUpdateStatus,
  onDelete,
  onClose,
}: Props) {
  const [notes, setNotes] = useState(profile.adminNotes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [busyAction, setBusyAction] = useState<null | "approve" | "reject" | "delete">(null);

  // Reset notes whenever the visible profile changes.
  useEffect(() => {
    setNotes(profile.adminNotes ?? "");
  }, [profile._id, profile.adminNotes]);

  const facts: Fact[] = [
    { label: "Registration #", value: registrationNumber ?? "—" },
    { label: "Marital status", value: profile.maritalStatus || "—" },
    { label: "Education", value: profile.education || "—" },
    { label: "Occupation", value: profile.job || "—" },
    { label: "Email", value: profile.email },
    { label: "Phone", value: profile.phone || "—" },
    { label: "Registered", value: formatDate(profile._creationTime) },
  ];

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      await onUpdateNotes(profile._id, notes);
    } finally {
      setSavingNotes(false);
    }
  };

  const handleStatus = async (status: "approved" | "rejected") => {
    setBusyAction(status === "approved" ? "approve" : "reject");
    try {
      await onUpdateStatus(profile._id, status);
    } finally {
      setBusyAction(null);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete this registration? This cannot be undone.")) return;
    setBusyAction("delete");
    try {
      await onDelete(profile._id);
      onClose();
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
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
        <StatusPill status={profile.status} />
        {isWaitlisted && <Pill tone="gold">Waitlisted</Pill>}
        {profile.paymentStatus && <StatusPill status={profile.paymentStatus} />}
      </div>

      {sectionHeading("Profile facts")}
      <div style={{ marginBottom: 24 }}>
        <FactList facts={facts} />
      </div>

      {profile.describeYourself && (
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
            “{profile.describeYourself}”
          </div>
        </>
      )}

      {profile.lookingFor && (
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
            “{profile.lookingFor}”
          </div>
        </>
      )}

      {sectionHeading("Admin notes")}
      <textarea
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
          disabled={savingNotes || notes === (profile.adminNotes ?? "")}
        >
          {savingNotes ? "Saving…" : "Save notes"}
        </button>
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          paddingTop: 16,
          borderTop: "1px solid var(--line-2)",
        }}
      >
        {(profile.status === "pending" || isWaitlisted) && (
          <>
            <button
              className="btn btn-primary"
              onClick={() => handleStatus("approved")}
              disabled={busyAction !== null}
            >
              {busyAction === "approve" ? "Approving…" : "Approve"}
            </button>
            <button
              className="btn"
              onClick={() => handleStatus("rejected")}
              disabled={busyAction !== null}
              style={{ color: "var(--rose)" }}
            >
              {busyAction === "reject" ? "Rejecting…" : "Reject"}
            </button>
          </>
        )}
        <button
          className="btn btn-ghost"
          onClick={handleDelete}
          disabled={busyAction !== null}
          style={{ color: "var(--rose)", marginLeft: "auto" }}
        >
          {busyAction === "delete" ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
  );
}
