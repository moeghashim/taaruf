"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
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

function interestTone(status?: string) {
  switch (status || "pending") {
    case "matched":
      return "green" as const;
    case "requested":
      return "blue" as const;
    case "declined":
      return "rose" as const;
    default:
      return "gold" as const;
  }
}

function summarizeInterestStatuses(interests: Array<{ adminStatus?: string; status?: string; matchId?: string | null }>) {
  return {
    pending: interests.filter((interest) => (interest.adminStatus || "pending") === "pending").length,
    requested: interests.filter((interest) => (interest.adminStatus || "pending") === "requested").length,
    declined: interests.filter((interest) => (interest.adminStatus || "pending") === "declined").length,
    matched: interests.filter((interest) => (interest.adminStatus || "pending") === "matched" || interest.matchId).length,
    activeWorkflow: interests.filter((interest) => interest.status === "active" || interest.status === "converted_to_match").length,
  };
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
  const eventHistory = useQuery(api.events.getByRegistration, {
    registrationId: profile._id as Id<"registrations">,
  });
  const interestHistory = useQuery(api.interests.getByRegistration, {
    registrationId: profile._id as Id<"registrations">,
  });
  const [notes, setNotes] = useState(profile.adminNotes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [busyAction, setBusyAction] = useState<null | "approve" | "reject" | "delete">(null);
  const about = currentText(profile.shareableBio, profile.describeYourself);
  const lookingFor = currentLookingFor(profile);
  const outboundInterests = interestHistory?.outbound ?? [];
  const inboundInterests = interestHistory?.inbound ?? [];
  const outboundSummary = summarizeInterestStatuses(outboundInterests);
  const inboundSummary = summarizeInterestStatuses(inboundInterests);

  // Reset notes whenever the visible profile changes.
  useEffect(() => {
    setNotes(profile.adminNotes ?? "");
  }, [profile._id, profile.adminNotes]);

  const facts: Fact[] = [
    { label: "Applicant #", value: registrationNumber ?? "—" },
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
            {profile.imageUrls.map((imageUrl, index) => (
              <img
                key={`${profile._id}-photo-${index}`}
                src={imageUrl}
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
      ) : null}

      {sectionHeading("Profile facts")}
      <div style={{ marginBottom: 24 }}>
        <FactList facts={facts} />
      </div>

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
            <Pill tone={interestTone("pending")}>Pending {outboundSummary.pending}</Pill>
            <Pill tone={interestTone("requested")}>Requested {outboundSummary.requested}</Pill>
            <Pill tone={interestTone("declined")}>Declined {outboundSummary.declined}</Pill>
            <Pill tone={interestTone("matched")}>Matched {outboundSummary.matched}</Pill>
            <Pill tone="plain">Active {outboundSummary.activeWorkflow}</Pill>
          </div>
        </div>
        <div style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 12, background: "var(--bg-tint)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
            <strong style={{ fontSize: 13 }}>Inbound interests</strong>
            <Pill tone="plain">{inboundInterests.length}</Pill>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Pill tone={interestTone("pending")}>Pending {inboundSummary.pending}</Pill>
            <Pill tone={interestTone("requested")}>Requested {inboundSummary.requested}</Pill>
            <Pill tone={interestTone("declined")}>Declined {inboundSummary.declined}</Pill>
            <Pill tone={interestTone("matched")}>Matched {inboundSummary.matched}</Pill>
            <Pill tone="plain">Active {inboundSummary.activeWorkflow}</Pill>
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
                <Pill tone={interestTone(interest.adminStatus)}>Status: {(interest.adminStatus || "pending").replace(/_/g, " ")}</Pill>
                <Pill tone="plain">Workflow: {interest.status.replace(/_/g, " ")}</Pill>
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
                <Pill tone={interestTone(interest.adminStatus)}>Status: {(interest.adminStatus || "pending").replace(/_/g, " ")}</Pill>
                <Pill tone="plain">Workflow: {interest.status.replace(/_/g, " ")}</Pill>
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
        {profile.status === "pending" && (
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
