"use client";
import { refreshAdminData } from "@/components/admin/hooks/use-admin-transport";

import { useProfileEventPages } from "@/components/admin/hooks/use-profile-event-pages";
import { workbenchEventLabel } from "@/lib/workbench-event-label";
import { matchEventId, inEventScope, scopedWorkbenchRecords } from "@/lib/workbench-event-filter";
import Link from "next/link";
import { canReleaseContacts, interestLifecycle, isArchivedInterest } from "@/lib/interest-lifecycle";
import { FemaleWorkflowActions, FemaleWorkflowOutbox } from "./female-workflow-actions";
import { MatchmakerActions, isMatchmaker } from "./matchmaker-actions";
import { NewMatchDialog } from "./new-match-dialog";
import { isManualMatchDraft } from "@/lib/manual-match-draft";
import { TestResetDialog } from "./test-reset-dialog";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAdminMutation as useMutation, useAdminQuery as useQuery } from "@/components/admin/hooks/use-admin-transport";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { PageHead } from "@/components/admin/layout/page-head";
import { DetailPane } from "@/components/admin/layout/detail-pane";
import { Pill, StatusPill } from "@/components/admin/primitives/status-pill";
import { WhoCell } from "@/components/admin/primitives/who-cell";
import { Ico } from "@/components/admin/primitives/icons";
import { useRegistrations } from "@/components/admin/hooks/use-registrations";

type Registration = Doc<"registrations">;
type RegistrationWithImages = Registration & { imageUrls?: string[] };
type InterestStatus = Doc<"interests">["status"];
type MatchStatus = Doc<"matches">["status"];
type PipelineStage = MatchStatus;
type ShareStatus = Doc<"profileShares">["status"];

type InterestRecord = Doc<"interests"> & {
  fromRegistration: RegistrationWithImages | null;
  toRegistration: RegistrationWithImages | null;
  match: Doc<"matches"> | null;
  event: Doc<"events"> | null;
};

type MatchRecord = Doc<"matches"> & {
  maleRegistration: RegistrationWithImages | null;
  femaleRegistration: RegistrationWithImages | null;
  interest: Doc<"interests"> | null;
};

type ProfileShareRecord = Doc<"profileShares"> & {
  owner: RegistrationWithImages | null;
  recipient: RegistrationWithImages | null;
};

const PIPELINE_STAGES: PipelineStage[] = ["new", "reviewing", "contact_shared", "paused", "closed", "declined"];
const ATTENTION_SHARE_STATUSES: ShareStatus[] = ["interested", "follow_up_needed", "viewed"];

function titleize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(timestamp?: number) {
  if (!timestamp) return "-";
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(timestamp?: number) {
  if (!timestamp) return "-";
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function eventLabel(event: Doc<"events"> | null) {
  if (!event) return "Unknown event";
  return event.eventCode ? `${event.title} (${event.eventCode})` : event.title;
}

function isOpenInterest(status: InterestStatus) {
  return status === "new" || status === "queued" || status === "active" || status === "deferred";
}

function pipelineStageForMatch(match: MatchRecord): PipelineStage {
  return match.status;
}

function useMatchingData(workbench = false) {
  const interestsLegacy = useQuery("interests.getAll", workbench ? "skip" : {});
  const matchesLegacy = useQuery("matches.getAll", workbench ? "skip" : {});
  const interestPages = useProfileEventPages("interests.workbenchPage", workbench ? {} : "skip");
  const matchPages = useProfileEventPages("matches.workbenchPage", workbench ? {} : "skip");
  const interestsRaw = workbench ? interestPages.rows : interestsLegacy;
  const matchesRaw = workbench ? matchPages.rows : matchesLegacy;
  const profileSharesRaw = useQuery("profileShares.getAll");
  const registrationsData = useRegistrations();

  const updateInterestStatus = useMutation("interests.updateStatus");
  const updateInterestNotes = useMutation("interests.updateNotes");
  const removeInterest = useMutation("interests.remove");
  const updateMatchStatus = useMutation("matches.updateStatus");
  const resumeMatch = useMutation("matches.resume");
  const resetPair = useMutation("matches.resetPair");

  const interests = useMemo(() => (interestsRaw ?? []) as InterestRecord[], [interestsRaw]);
  const matches = useMemo(() => (matchesRaw ?? []) as MatchRecord[], [matchesRaw]);
  const profileShares = useMemo(
    () => (profileSharesRaw ?? []) as ProfileShareRecord[],
    [profileSharesRaw]
  );
  const isLoading =
    interestsRaw === undefined ||
    matchesRaw === undefined ||
    profileSharesRaw === undefined ||
    registrationsData.isLoading;

  return {
    error: interestPages.error || matchPages.error,
    retry: () => { interestPages.retry(); matchPages.retry(); },
    isLoading,
    interests,
    matches,
    profileShares,
    registrations: registrationsData.registrations,
    registrationNumbers: registrationsData.registrationNumbers,
    actions: {
      resumeMatch: (id: string) => resumeMatch({ id: id as Id<"matches"> }),
      updateInterestStatus: (id: string, status: InterestStatus) =>
        updateInterestStatus({ id: id as Id<"interests">, status }),
      updateInterestNotes: (id: string, notes: string) =>
        updateInterestNotes({ id: id as Id<"interests">, notes }),
      removeInterest: (id: string) => removeInterest({ id: id as Id<"interests"> }),
      updateMatchStatus: (id: string, status: MatchStatus, adminNotes?: string) =>
        updateMatchStatus({ id: id as Id<"matches">, status, adminNotes }),
      resetPair: (registrationAId: string, registrationBId: string) =>
        resetPair({
          registrationAId: registrationAId as Id<"registrations">,
          registrationBId: registrationBId as Id<"registrations">,
        }),
    },
  };
}

async function shareContacts(matchId: string, femaleInterestId?: string) {
  const response = await fetch(femaleInterestId ? "/api/admin/female-review" : "/api/admin/share-contacts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(femaleInterestId ? { action: "release", interestId: femaleInterestId } : { matchId }) });
  const result = await response.json();
      if (response.ok) refreshAdminData();
  if (!response.ok) throw new Error(result.error || "Contact sharing failed");
  return result;
}

export function ContactRelease({ match, femaleInterestId, onMessage }: { match: Doc<"matches"> | null; femaleInterestId?: string; onMessage: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  if (isMatchmaker(match) || !canReleaseContacts(match)) return null;
  async function release() {
    if (busy || !match || !window.confirm("Share contacts? This is the final admin release of contacts in both authenticated applicant portals. Notification emails will be queued.")) return;
    setBusy(true);
    try { await shareContacts(match._id, femaleInterestId); onMessage("Contacts released. Notification emails queued for both applicants."); }
    catch (error) { onMessage(error instanceof Error ? error.message : "Contact release failed. Refresh and try again."); }
    finally { setBusy(false); }
  }
  return <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => void release()}>{busy ? "Sharing…" : "Share contacts"}</button>;
}

type MatchingData = ReturnType<typeof useMatchingData>;

function AdminSelect<T extends string>({
  value,
  values,
  onChange,
  label,
}: {
  value: T;
  values: T[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <label style={{ display: "grid", gap: 4, minWidth: 140 }}>
      <span className="mono" style={{ color: "var(--mute)", fontSize: 10 }}>
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        style={{
          height: 34,
          border: "1px solid var(--line)",
          borderRadius: 6,
          background: "var(--panel)",
          padding: "0 9px",
          fontSize: 12,
        }}
      >
        {values.map((item) => (
          <option key={item} value={item}>
            {titleize(item)}
          </option>
        ))}
      </select>
    </label>
  );
}

function EmptyState({ body }: { body: string }) {
  return (
    <div className="coming-soon" style={{ padding: "52px 20px" }}>
      <div className="lede">Nothing here.</div>
      <p>{body}</p>
    </div>
  );
}

function LoadingPanel() {
  return (
    <div className="panel">
      <div className="coming-soon" style={{ padding: "52px 20px" }}>
        <p>Loading...</p>
      </div>
    </div>
  );
}

function Notice({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div
      style={{
        border: "1px solid var(--line)",
        background: "var(--bg-tint)",
        borderRadius: 6,
        padding: "10px 12px",
        color: "var(--ink-2)",
        fontSize: 12,
        marginBottom: 16,
      }}
    >
      {text}
    </div>
  );
}

function ApplicantLink({
  registration,
  number,
  muted = false,
}: {
  registration: RegistrationWithImages | null;
  number?: number;
  muted?: boolean;
}) {
  if (!registration) {
    return <span style={{ color: "var(--mute)" }}>Unknown profile</span>;
  }

  return (
    <Link href={`/admin/profiles?profile=${registration._id}`} style={{ display: "inline-flex" }}>
      <WhoCell
        name={`#${number ?? "-"} ${registration.name}`}
        gender={registration.gender}
        sub={`${registration.age} · ${registration.email}${muted ? " · linked profile" : ""}`}
        imageUrl={registration.imageUrls?.[0]}
      />
    </Link>
  );
}

function ApplicantMini({
  registration,
  number,
}: {
  registration: RegistrationWithImages | null;
  number?: number;
}) {
  if (!registration) return <Pill tone="plain">Unknown</Pill>;
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <Pill tone={registration.gender === "female" ? "rose" : "green"}>
        #{number ?? "-"} {registration.name}
      </Pill>
      <Pill tone="plain">{registration.age}</Pill>
      <StatusPill status={registration.profileCompletionStatus ?? "not_started"} />
    </div>
  );
}

function NotesEditor({
  initialValue,
  onSave,
  placeholder,
}: {
  initialValue?: string;
  onSave: (value: string) => Promise<unknown>;
  placeholder: string;
}) {
  const [value, setValue] = useState(initialValue ?? "");
  const [saving, setSaving] = useState(false);
  useEffect(() => { setValue(initialValue ?? ""); }, [initialValue]);

  const save = async () => {
    setSaving(true);
    try {
      await onSave(value);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        rows={3}
        style={{
          width: "100%",
          border: "1px solid var(--line)",
          borderRadius: 6,
          padding: 10,
          resize: "vertical",
          fontSize: 12,
          background: "var(--panel)",
        }}
      />
      <div>
        <button className="btn btn-sm" type="button" onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save notes"}
        </button>
      </div>
    </div>
  );
}

function ProfileComparison({
  left,
  right,
  leftNumber,
  rightNumber,
}: {
  left: RegistrationWithImages | null;
  right: RegistrationWithImages | null;
  leftNumber?: number;
  rightNumber?: number;
}) {
  const renderProfile = (registration: RegistrationWithImages | null, number?: number, label?: string) => (
    <section
      style={{
        border: "1px solid var(--line)",
        borderRadius: 8,
        background: "var(--panel)",
        overflow: "hidden",
      }}
    >
      <div className="panel-head">
        <h3>{label}</h3>
      </div>
      <div style={{ padding: 16, display: "grid", gap: 14 }}>
        <ApplicantLink registration={registration} number={number} />
        {registration ? (
          <>
            {registration.imageUrls?.length ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(88px, 1fr))",
                  gap: 8,
                }}
              >
                {registration.imageUrls.map((imageUrl, index) => (
                  <img
                    key={`${registration._id}-comparison-photo-${index}`}
                    src={imageUrl}
                    alt={`${registration.name} photo ${index + 1}`}
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
            ) : null}
            <div className="fact-list">
              <div className="fact">
                <div className="k">Status</div>
                <div className="v">
                  <StatusPill status={registration.status} />
                </div>
              </div>
              <div className="fact">
                <div className="k">Payment</div>
                <div className="v">
                  {registration.paymentStatus ? <StatusPill status={registration.paymentStatus} /> : "-"}
                </div>
              </div>
              <div className="fact">
                <div className="k">Background</div>
                <div className="v">{registration.ethnicity || registration.maritalStatus || "-"}</div>
              </div>
              <div className="fact">
                <div className="k">Prayer</div>
                <div className="v">{registration.prayerCommitment ? titleize(registration.prayerCommitment) : "-"}</div>
              </div>
              <div className="fact">
                <div className="k">Photos</div>
                <div className="v">
                  {registration.photoSharingPermission ? titleize(registration.photoSharingPermission) : "-"}
                </div>
              </div>
            </div>
            <div>
              <h4 style={{ fontSize: 11, color: "var(--mute)", textTransform: "uppercase", marginBottom: 8 }}>
                Shareable bio
              </h4>
              <p
                style={{
                  background: "var(--bg-tint)",
                  borderRadius: 6,
                  padding: 12,
                  whiteSpace: "pre-wrap",
                  fontFamily: "var(--font-admin-serif)",
                  fontStyle: "italic",
                  color: "var(--ink-2)",
                }}
              >
                {registration.shareableBio || registration.describeYourself || "-"}
              </p>
            </div>
            <div>
              <h4 style={{ fontSize: 11, color: "var(--mute)", textTransform: "uppercase", marginBottom: 8 }}>
                Top requirements
              </h4>
              <ol style={{ margin: 0, paddingLeft: 18, color: "var(--ink-2)" }}>
                <li>{registration.spouseRequirement1 || "-"}</li>
                <li>{registration.spouseRequirement2 || "-"}</li>
                <li>{registration.spouseRequirement3 || "-"}</li>
              </ol>
            </div>
            {registration.adminNotes && (
              <div>
                <h4 style={{ fontSize: 11, color: "var(--mute)", textTransform: "uppercase", marginBottom: 8 }}>
                  Admin notes
                </h4>
                <p style={{ whiteSpace: "pre-wrap", color: "var(--ink-2)" }}>{registration.adminNotes}</p>
              </div>
            )}
          </>
        ) : (
          <p style={{ color: "var(--mute)" }}>Profile not found.</p>
        )}
      </div>
    </section>
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
      {renderProfile(left, leftNumber, "Requester")}
      {renderProfile(right, rightNumber, "Target")}
    </div>
  );
}

function useNotifyDecline() {
  return async (interestId: string) => {
    const response = await fetch("/api/admin/notify-decline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interestId }),
    });
    const data = await response.json();
      if (response.ok) refreshAdminData();
    if (!response.ok) {
      throw new Error(data.error || "Failed to send decline notification");
    }
    return data.skipped ? "Decline notification already sent." : "Decline notification sent.";
  };
}

function useNotifyMatch() {
  return async (matchId: string) => {
    const response = await fetch("/api/admin/notify-match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId }),
    });
    const data = await response.json();
      if (response.ok) refreshAdminData();
    if (!response.ok) {
      throw new Error(data.error || "Failed to send match notification");
    }
    return `Match notification sent to ${data.summary?.sent ?? 0} applicants.`;
  };
}

function useCreateProfileShare() {
  return async ({
    ownerRegistrationId,
    recipientRegistrationId,
    includeImages,
    interestId,
    matchId,
  }: {
    ownerRegistrationId: string;
    recipientRegistrationId: string;
    includeImages: boolean;
    interestId?: string;
    matchId?: string;
  }) => {
    const response = await fetch("/api/admin/create-profile-share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ownerRegistrationId, recipientRegistrationId, includeImages, interestId, matchId }),
    });
    const data = await response.json();
      if (response.ok) refreshAdminData();
    if (!response.ok) {
      throw new Error(data.error || "Failed to create profile share");
    }
    return data.shareUrl as string;
  };
}

function InterestActions({
  interest,
  data,
  onMessage,
  onReset,
}: {
  interest: InterestRecord;
  onReset: (interest: InterestRecord) => void;
  data: MatchingData;
  onMessage: (message: string) => void;
}) {
  const notifyDecline = useNotifyDecline();
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const run = async (label: string, action: () => Promise<unknown>, success: string) => {
    setBusy(label);
    try {
      await action();
      onMessage(success);
      setFeedback(success);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onMessage(message);
      setFeedback(message);
    } finally {
      setBusy(null);
    }
  };

  if (interest.testReset) return <span role="status">Test reset — audit retained</span>;
  if (interest.femaleWorkflow || (interest.visibility === "internal_only" && interest.fromRegistration?.gender === "female" && !interest.matchId)) return <div>
    <ContactRelease match={interest.match} femaleInterestId={interest.femaleWorkflow ? interest._id : undefined} onMessage={onMessage} />
    <FemaleWorkflowActions interestId={interest._id} state={interest.femaleWorkflow?.state ?? (isOpenInterest(interest.status) ? "private_documented" : "declined")} compact />
    {isOpenInterest(interest.status) && !interest.matchId && <>
      <button className="btn btn-sm" disabled={busy !== null} onClick={() => void run("decline", () => data.actions.updateInterestStatus(interest._id, "declined"), "Interest declined.")}>Decline interest</button>
      <button className="btn btn-sm" disabled={busy !== null} onClick={() => void run("close", () => data.actions.updateInterestStatus(interest._id, "closed"), "Interest closed.")}>Close interest</button>
    </>}
    {!interest.matchId && interest.source === "platform_submission" && <button className="btn btn-sm btn-ghost" type="button" onClick={() => onReset(interest)}>Reset test submission</button>}
  </div>;

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
      <ContactRelease match={interest.match} onMessage={onMessage} />
      {isOpenInterest(interest.status) && !interest.matchId && <>
        <button className="btn btn-sm" disabled={busy !== null} onClick={() => void run("decline", async () => { await data.actions.updateInterestStatus(interest._id, "declined"); await notifyDecline(interest._id); }, "Interest declined.")}>Decline interest</button>
        <button className="btn btn-sm btn-ghost" disabled={busy !== null} onClick={() => void run("close", () => data.actions.updateInterestStatus(interest._id, "closed"), "Interest closed.")}>Close interest</button>
      </>}
      {interest.status === "declined" && (
        <button
          className="btn btn-sm"
          type="button"
          disabled={busy !== null}
          onClick={() => run("notify-decline", () => notifyDecline(interest._id), "Decline notification sent.")}
        >
          {busy === "notify-decline" ? "Sending..." : interest.declineNotificationError ? "Retry notice" : "Send notice"}
        </button>
      )}
      {!interest.matchId && interest.source !== "platform_submission" && (
        <button
          className="btn btn-sm btn-ghost"
          type="button"
          disabled={busy !== null}
          style={{ color: "var(--rose)" }}
          onClick={() => {
            if (!window.confirm("Delete this interest? This cannot be undone.")) return;
            void run("delete", () => data.actions.removeInterest(interest._id), "Interest deleted.");
          }}
        >
          Delete
        </button>
      )}
      {!interest.matchId && interest.source === "platform_submission" && (
        <button className="btn btn-sm btn-ghost" type="button" disabled={busy !== null} onClick={() => onReset(interest)}>Reset test submission</button>
      )}
      {feedback && <p role="alert" style={{ flexBasis: "100%", margin: 0 }}>{feedback}</p>}
    </div>
  );
}

function InterestRow({
  interest,
  data,
  numbers,
  onMessage,
  onReset,
}: {
  onReset: (interest: InterestRecord) => void;
  interest: InterestRecord;
  data: MatchingData;
  numbers: Map<string, number>;
  onMessage: (message: string) => void;
}) {
  return (
    <tr style={{ opacity: isArchivedInterest(interest) ? 0.6 : 1 }}>
      <td>
        <div style={{ display: "grid", gap: 8 }}>
          <ApplicantLink
            registration={interest.fromRegistration}
            number={interest.fromRegistration ? numbers.get(interest.fromRegistration._id) : undefined}
          />
          <div style={{ color: "var(--mute)", fontSize: 11 }}>to</div>
          <ApplicantLink
            registration={interest.toRegistration}
            number={interest.toRegistration ? numbers.get(interest.toRegistration._id) : undefined}
          />
        </div>
      </td>
      <td>
        <div style={{ display: "grid", gap: 6 }}>
          <Pill tone={interest.event?.series === "manual_admin" ? "gold" : "green"}>
            {interest.event?.eventCode ?? "event"}
          </Pill>
          <div style={{ color: "var(--ink-2)", fontSize: 12 }}>{interest.source === "platform_submission" && (!interest.event || interest.event.eventCode === "manual-admin") ? "Applicant interest (outside event)" : interest.event?.title ?? "Unknown event"}</div>
          {interest.event?.startsAt && (
            <div className="mono" style={{ color: "var(--mute)", fontSize: 11 }}>
              {formatDate(interest.event.startsAt)}
            </div>
          )}
        </div>
      </td>
      <td>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          <Pill tone="plain">{interestLifecycle(interest)}</Pill>
          <Pill tone={interest.visibility === "internal_only" ? "blue" : "plain"}>
            {titleize(interest.visibility)}
          </Pill>
          <Pill tone="plain">{interest.source === "platform_submission" ? "Applicant interest" : titleize(interest.source)}</Pill>
        </div>
        {interest.declineNotificationError && (
          <p style={{ color: "var(--rose)", fontSize: 11, marginTop: 8 }}>
            Notice failed: {interest.declineNotificationError}
          </p>
        )}
        {interest.declineNotificationSentAt && (
          <p style={{ color: "var(--mute)", fontSize: 11, marginTop: 8 }}>
            Notice sent {formatDateTime(interest.declineNotificationSentAt)}
          </p>
        )}
      </td>
      <td style={{ minWidth: 220 }}>
        <p>Requester #{interest.fromRegistration?.publicApplicantNumber ?? "-"} → Target #{interest.toRegistration?.publicApplicantNumber ?? "-"}</p>
        <p>Updated {formatDateTime(interest.updatedAt ?? interest.createdAt ?? interest._creationTime)}</p>
        <NotesEditor
          initialValue={interest.notes}
          placeholder="Interest notes..."
          onSave={(notes) => data.actions.updateInterestNotes(interest._id, notes)}
        />
      </td>
      <td>
        <InterestActions interest={interest} data={data} onMessage={onMessage} onReset={onReset} />
      </td>
    </tr>
  );
}

export function InterestsPageClient() {
  const data = useMatchingData();
  const [resetSelection, setResetSelection] = useState<{ id: string; pair: string; event: string } | null>(null);
  const [visibility, setVisibility] = useState<"all" | "internal_only" | "admin_actionable">("all");
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const eventOptions = useMemo(() => {
    const byId = new Map<string, Doc<"events">>();
    for (const interest of data.interests) {
      if (interest.event) byId.set(interest.event._id, interest.event);
    }
    return [...byId.values()].sort((a, b) => b.startsAt - a.startsAt);
  }, [data.interests]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.interests
      .filter((interest) => visibility === "all" || interest.visibility === visibility)
      .filter((interest) => eventFilter === "all" || interest.eventId === eventFilter)
      .filter((interest) => {
        if (!q) return true;
        return [
          interest.fromRegistration?.name,
          interest.toRegistration?.name,
          interest.notes,
          interest.source,
          interest.event?.title,
          interest.event?.eventCode,
          interest.event?.eventMonth,
        ]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(q));
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [data.interests, eventFilter, search, visibility]);

  return (
    <>
      <PageHead
        title={<>Interest <em>signals</em></>}
        subtitle="Review applicant decisions, share requester profiles, and release contacts after both approvals."
      />
      <Notice text={message} />
      {resetSelection && <TestResetDialog key={resetSelection.id} selection={resetSelection} onClose={() => setResetSelection(null)} onSuccess={setMessage} />}
      {data.isLoading ? (
        <LoadingPanel />
      ) : (
        <div className="panel">
          <div className="filters">
            <div className="search-inline">
              <span className="glass">{Ico.search}</span>
              <input placeholder="Search names, source, notes..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            {(["all", "admin_actionable", "internal_only"] as const).map((item) => (
              <button
                key={item}
                type="button"
                className={`filt ${visibility === item ? "active" : ""}`}
                onClick={() => setVisibility(item)}
              >
                {item === "all" ? "All visibility" : titleize(item)}
              </button>
            ))}
            <select
              value={eventFilter}
              onChange={(event) => setEventFilter(event.target.value)}
              style={{
                height: 34,
                border: "1px solid var(--line)",
                borderRadius: 6,
                background: "var(--panel)",
                padding: "0 9px",
                fontSize: 12,
                maxWidth: 260,
              }}
              aria-label="Filter by event"
            >
              <option value="all">All events</option>
              {eventOptions.map((event) => (
                <option key={event._id} value={event._id}>
                  {eventLabel(event)}
                </option>
              ))}
            </select>
            <span className="mono" style={{ marginLeft: "auto", color: "var(--mute)" }}>
              {filtered.length} shown
            </span>
          </div>
          {filtered.length === 0 ? (
            <EmptyState body="No interest signals match the current filters." />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Applicants</th>
                  <th>Event</th>
                  <th>Status</th>
                  <th>Notes</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((interest) => (
                  <InterestRow
                    key={interest._id}
                    interest={interest}
                    data={data}
                    numbers={data.registrationNumbers}
                    onMessage={setMessage}
                    onReset={interest => setResetSelection({ id: interest._id, pair: `#${interest.fromRegistration?.publicApplicantNumber ?? "?"} → #${interest.toRegistration?.publicApplicantNumber ?? "?"}`, event: interest.event?.title ?? "Unknown event" })}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}

function MatchCard({
  match,
  data,
  numbers,
  onMessage,
}: {
  match: MatchRecord;
  data: MatchingData;
  numbers: Map<string, number>;
  onMessage: (message: string) => void;
}) {
  const notifyMatch = useNotifyMatch();
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (label: string, action: () => Promise<unknown>, success: string) => {
    setBusy(label);
    try {
      await action();
      onMessage(success);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      style={{
        border: "1px solid var(--line)",
        borderRadius: 8,
        background: "var(--panel)",
        padding: 14,
        display: "grid",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 8 }}>
          <StatusPill status={pipelineStageForMatch(match)} />
          <ApplicantMini registration={match.maleRegistration} number={match.maleRegistration ? numbers.get(match.maleRegistration._id) : undefined} />
          <ApplicantMini registration={match.femaleRegistration} number={match.femaleRegistration ? numbers.get(match.femaleRegistration._id) : undefined} />
        </div>
        <span className="mono" style={{ color: "var(--mute)" }}>{formatDateTime(match.updatedAt ?? match.createdAt ?? match._creationTime)}</span>
      </div>

      <MatchmakerActions match={match} male={match.maleRegistration} female={match.femaleRegistration} onMessage={onMessage} />
      <ContactRelease match={match} femaleInterestId={match.interest?.femaleWorkflow ? match.interest._id : undefined} onMessage={onMessage} />
      {match.interest?.femaleWorkflow && <FemaleWorkflowActions interestId={match.interest._id} state={match.interest.femaleWorkflow.state} />}
      {!isManualMatchDraft(match) && match.status === "paused" && <button type="button" className="btn" disabled={busy !== null} onClick={() => void run("resume", () => data.actions.resumeMatch(match._id), "Match resumed.")}>Resume</button>}
      {!["closed", "declined"].includes(match.status) && <AdminSelect label="Close or pause match" value={match.status} values={[match.status, ...((isManualMatchDraft(match) ? ["closed"] : ["closed", "declined", "paused"]) as MatchStatus[]).filter(status => status !== match.status)]} onChange={(nextStatus) => void run("status", () => data.actions.updateMatchStatus(match._id, nextStatus, match.adminNotes), "Match status updated.")} />}
      <NotesEditor initialValue={match.adminNotes} placeholder="Match notes..." onSave={(notes) => data.actions.updateMatchStatus(match._id, match.status, notes)} />

      {match.matchNotificationError && (
        <p style={{ color: "var(--rose)", fontSize: 11 }}>Notification issue: {match.matchNotificationError}</p>
      )}
      {match.matchNotificationSentAt && (
        <p style={{ color: "var(--mute)", fontSize: 11 }}>
          Notification sent {formatDateTime(match.matchNotificationSentAt)}
        </p>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button
          type="button"
          className="btn btn-sm"
          disabled={busy !== null}
          hidden={Boolean(match.interest?.femaleWorkflow) || isMatchmaker(match)}
          onClick={() => run("notify", () => notifyMatch(match._id), "Match notification sent.")}
        >
          {busy === "notify" ? "Sending..." : "Notify match"}
        </button>
        <Link className="btn btn-sm" href={`/admin/workbench?match=${match._id}`}>
          Open workbench
        </Link>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          disabled={busy !== null}
          style={{ color: "var(--rose)" }}
          onClick={() => {
            if (!window.confirm("Reset this pair? Linked matches will be deleted.")) return;
            void run(
              "reset",
              () => data.actions.resetPair(match.maleRegistrationId, match.femaleRegistrationId),
              "Pair reset."
            );
          }}
        >
          Reset pair
        </button>
      </div>
    </div>
  );
}

export function PipelinePageClient() {
  const data = useMatchingData();
  const [message, setMessage] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<PipelineStage, MatchRecord[]>();
    for (const stage of PIPELINE_STAGES) map.set(stage, []);
    for (const match of data.matches) {
      map.get(pipelineStageForMatch(match))?.push(match);
    }
    for (const matches of map.values()) {
      matches.sort((a, b) => b.updatedAt - a.updatedAt);
    }
    return map;
  }, [data.matches]);

  return (
    <>
      <PageHead
        title={<>Matching <em>pipeline</em></>}
        subtitle="Review applicant approvals and release contacts after final admin confirmation."
      />
      <Notice text={message} />
      {data.isLoading ? (
        <LoadingPanel />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          {PIPELINE_STAGES.map((stage) => {
            const matches = grouped.get(stage) ?? [];
            return (
              <section key={stage} className="panel" style={{ minHeight: 240 }}>
                <div className="panel-head">
                  <h3>{titleize(stage)}</h3>
                  <Pill tone="plain">{matches.length}</Pill>
                </div>
                <div style={{ padding: 12, display: "grid", gap: 12 }}>
                  {matches.length === 0 ? (
                    <p style={{ color: "var(--mute)", padding: 12 }}>No matches.</p>
                  ) : (
                    matches.map((match) => (
                      <MatchCard key={match._id} match={match} data={data} numbers={data.registrationNumbers} onMessage={setMessage} />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

function ShareProfileAction({
  interest,
  matchId,
  owner,
  recipient,
  onMessage,
  role,
}: {
  interest?: Doc<"interests"> | null;
  matchId?: string;
  role: "Requester" | "Target";
  owner: Registration | null;
  recipient: Registration | null;
  onMessage: (message: string) => void;
}) {
  const createShare = useCreateProfileShare();
  const scoped = interest?.fromRegistrationId === owner?._id ? interest?.senderPhotoConsent : undefined;
  const canSharePhotos = scoped !== undefined ? scoped === "yes" && interest?.senderPhotoConsentRevokedAt === undefined : owner?.photoSharingPermission === "yes";
  const [includeImages, setIncludeImages] = useState(false);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!owner || !recipient) return;
    setBusy(true);
    try {
      const shareUrl = await createShare({
        ownerRegistrationId: owner._id,
        recipientRegistrationId: recipient._id,
        includeImages: includeImages && canSharePhotos,
        interestId: interest?._id,
        matchId,
      });
      onMessage(`Share link created: ${shareUrl}`);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12 }}>
        <input type="checkbox" checked={includeImages} disabled={!canSharePhotos} onChange={(event) => setIncludeImages(event.target.checked)} />
        Include {role.toLowerCase()} photos ({owner?.name ?? "Unknown"}){!canSharePhotos ? " — owner consent required" : ""}
      </label>
      <button className="btn btn-sm" type="button" onClick={create} disabled={busy || !owner || !recipient}>
        {busy ? "Creating..." : `Share ${role.toLowerCase()} profile → ${recipient?.name ?? "Unknown"}`}
      </button>
    </div>
  );
}

export function WorkbenchPageClient() {
  const searchParams = useSearchParams();
  const data = useMatchingData(true);
  const catalog = useProfileEventPages("events.profileFilterCatalog", {});
  const [eventScope, setEventScope] = useState(searchParams.get("event") ?? "all");
  const { interests, matches } = scopedWorkbenchRecords(data.interests, data.matches, eventScope);
  const notifyDecline = useNotifyDecline();
  const [selectedInterestId, setSelectedInterestId] = useState<string>("");
  const [selectedMatchId, setSelectedMatchId] = useState<string>("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setEventScope(searchParams.get("event") ?? "all");
    setSelectedInterestId(searchParams.get("interest") ?? "");
    setSelectedMatchId(searchParams.get("match") ?? "");
  }, [searchParams]);

  const [mode, setMode] = useState<"interest" | "match">("interest");
  useEffect(() => { setMode(searchParams.has("match") && !searchParams.has("interest") ? "match" : "interest"); }, [searchParams]);
  const selectedInterest = mode === "match" ? null : interests.find(i => i._id === selectedInterestId) ?? null;
  const selectedMatch = mode === "interest" ? null : matches.find(m => m._id === selectedMatchId) ?? null;
  useEffect(() => {
    if (data.isLoading) return;
    if (selectedInterestId && !interests.some(i => i._id === selectedInterestId)) setSelectedInterestId("");
    if (selectedMatchId && !matches.some(m => m._id === selectedMatchId)) setSelectedMatchId("");
  }, [data.isLoading, interests, matches, selectedInterestId, selectedMatchId]);
  const requesterIsFemale = selectedMatch?.interest?.fromRegistrationId === selectedMatch?.femaleRegistrationId;
  const left = (requesterIsFemale ? selectedMatch?.femaleRegistration : selectedMatch?.maleRegistration) ?? selectedInterest?.fromRegistration ?? null;
  const right = (requesterIsFemale ? selectedMatch?.maleRegistration : selectedMatch?.femaleRegistration) ?? selectedInterest?.toRegistration ?? null;

  const run = async (label: string, action: () => Promise<unknown>, success: string) => {
    setBusy(label);
    try {
      await action();
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHead
        title={<>Match <em>workbench</em></>}
        subtitle="Compare profiles side by side and take the next matching action without returning to legacy."
        actions={<NewMatchDialog />}
      />
      <Notice text={message} />
      {data.error || catalog.error ? <div role="alert">Workbench data unavailable. <button className="btn" onClick={() => { data.retry(); catalog.retry(); }}>Retry</button></div> : data.isLoading || !catalog.rows ? (
        <LoadingPanel />
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          <section className="panel" aria-label="Event filter" style={{ padding: 16, background: "var(--bg-tint)", display: "grid", gap: 10 }}>
            <label htmlFor="workbench-event" style={{ fontWeight: 600 }}>Filter workbench by event</label>
            <select id="workbench-event" value={eventScope} onChange={event => { setEventScope(event.target.value); setSelectedInterestId(""); setSelectedMatchId(""); setMessage(null); }} style={{ width: "100%", minWidth: 0, minHeight: 44, background: "var(--panel)", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 6, padding: 8 }}>
              <option value="all">All events</option>
              <option value="unscoped">No recorded event</option>
              {catalog.rows.map(event => <option key={event._id} value={event._id}>{workbenchEventLabel(event)}</option>)}
              {eventScope !== "all" && eventScope !== "unscoped" && !catalog.rows.some(e => e._id === eventScope) && <option value={eventScope}>Unavailable event</option>}
            </select>
            <p aria-live="polite">{interests.length} interests · {matches.length} matches. Global conflict and consent checks still apply.</p>
            {eventScope === "unscoped" && <p>Matches without a valid linked interest have no recorded event. They are excluded from named events.</p>}
          </section>
          <div className="panel">
            <div className="filters">
              <label style={{ display: "grid", gap: 4, minWidth: 0, width: "100%", flex: "1 1 260px" }}>
                <span className="mono" style={{ color: "var(--mute)", fontSize: 10 }}>Interest</span>
                <select
                  value={selectedInterest?._id ?? ""}
                  onChange={(event) => { setSelectedInterestId(event.target.value); setSelectedMatchId(""); setMode("interest"); setMessage(null); }}
                  style={{ width: "100%", minWidth: 0, height: 36, border: "1px solid var(--line)", borderRadius: 6, padding: "0 10px" }}
                >
                  <option value="" disabled>Select an interest</option>
                  {[...interests].sort((a,b) => Number(!isOpenInterest(a.status)) - Number(!isOpenInterest(b.status))).map((interest) => (
                    <option key={interest._id} value={interest._id} style={{ color: isOpenInterest(interest.status) ? undefined : "gray" }}>
                      #{interest.fromRegistration ? data.registrationNumbers.get(interest.fromRegistration._id) : "-"} {interest.fromRegistration?.name ?? "Unknown"} to #{interest.toRegistration ? data.registrationNumbers.get(interest.toRegistration._id) : "-"} {interest.toRegistration?.name ?? "Unknown"} · {interestLifecycle(interest)}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "grid", gap: 4, minWidth: 0, width: "100%", flex: "1 1 260px" }}>
                <span className="mono" style={{ color: "var(--mute)", fontSize: 10 }}>Match</span>
                <select
                  value={selectedMatch?._id ?? ""}
                  onChange={(event) => { setSelectedMatchId(event.target.value); setSelectedInterestId(""); setMode("match"); setMessage(null); }}
                  style={{ width: "100%", minWidth: 0, height: 36, border: "1px solid var(--line)", borderRadius: 6, padding: "0 10px" }}
                >
                  <option value="" disabled>Select a match</option>
                  {[...matches].sort((a,b) => Number(["closed", "declined"].includes(a.status)) - Number(["closed", "declined"].includes(b.status))).map((match) => (
                    <option key={match._id} value={match._id} style={{ color: ["closed", "declined"].includes(match.status) ? "gray" : undefined }}>
                      #{match.maleRegistration ? data.registrationNumbers.get(match.maleRegistration._id) : "-"} {match.maleRegistration?.name ?? "Unknown"} + #{match.femaleRegistration ? data.registrationNumbers.get(match.femaleRegistration._id) : "-"} {match.femaleRegistration?.name ?? "Unknown"} · {titleize(match.status)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div style={{ padding: 16 }}>
              {!selectedInterest && !selectedMatch && <p role="status">{interests.length || matches.length ? "Select an interest or match to review." : "No interests or matches in this event filter."}</p>}
              <p><strong>{mode === "interest" ? "Interest review" : "Match review"}</strong> · Requester {left?.name ?? "—"} → Target {right?.name ?? "—"}</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {[left, right].map((person) => person && <section key={person._id}>
                  <h4>{person.name}: other interests and workflows in this filter</h4>
                  {data.matches.some(m => m._id !== selectedMatch?._id && [m.maleRegistrationId, m.femaleRegistrationId].includes(person._id) && !["closed", "declined", "paused"].includes(m.status) && !inEventScope(matchEventId(m), eventScope)) && <p><strong>Another active match exists outside this filter.</strong> Global safety checks still apply.</p>}
                  <p>{person.activeMatchId ? "Contacts already released in an active connection. A second release is blocked." : "No released active connection"}</p>
                  <p>{interests.some((i) => i.fromRegistrationId === right?._id && i.toRegistrationId === left?._id && isOpenInterest(i.status)) && interests.some((i) => i.fromRegistrationId === left?._id && i.toRegistrationId === right?._id && isOpenInterest(i.status)) || selectedMatch?.interestType === "mutual_interest" ? "Mutual interest" : "No reciprocal open interest recorded"}</p>
                  {interests.filter((i) => (i.fromRegistrationId === person._id || i.toRegistrationId === person._id) && i._id !== selectedInterest?._id && i._id !== selectedMatch?.interestId).map((i) => <p key={i._id} style={{ opacity: isOpenInterest(i.status) ? 1 : 0.5 }}>#{i.fromRegistration?.publicApplicantNumber} {i.fromRegistration?.name} → #{i.toRegistration?.publicApplicantNumber} {i.toRegistration?.name} · {interestLifecycle(i)}</p>)}
                  {matches.filter((m) => m._id !== selectedMatch?._id && [m.maleRegistrationId, m.femaleRegistrationId].includes(person._id) && !["closed", "declined", "paused"].includes(m.status)).map((m) => <p key={m._id}><strong>Other active match:</strong> {m.maleRegistration?.name} + {m.femaleRegistration?.name} · {titleize(m.status)}</p>)}
                </section>)}
              </div>
              <ProfileComparison
                left={left}
                right={right}
                leftNumber={left ? data.registrationNumbers.get(left._id) : undefined}
                rightNumber={right ? data.registrationNumbers.get(right._id) : undefined}
              />
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>{mode === "interest" ? "Evaluating interest" : "Evaluating match"} · {selectedInterest ? interestLifecycle(selectedInterest) : selectedMatch?.status ?? "No selection"}</h3>
            </div>
            <div style={{ padding: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              {selectedInterest && !selectedInterest.femaleWorkflow && selectedInterest.visibility === "internal_only" && selectedInterest.fromRegistration?.gender === "female" && !selectedInterest.matchId && isOpenInterest(selectedInterest.status) && <FemaleWorkflowActions interestId={selectedInterest._id} state="private_documented" />}
              {selectedInterest?.femaleWorkflow && <FemaleWorkflowActions interestId={selectedInterest._id} state={selectedInterest.femaleWorkflow.state} />}
              {selectedMatch?.interest?.femaleWorkflow && <FemaleWorkflowActions interestId={selectedMatch.interest._id} state={selectedMatch.interest.femaleWorkflow.state} />}
              {selectedInterest && !selectedInterest.matchId && isOpenInterest(selectedInterest.status) && (
                <button
                  className="btn"
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    run(
                      "decline",
                      async () => {
                        await data.actions.updateInterestStatus(selectedInterest._id, "declined");
                        if (!selectedInterest.femaleWorkflow) await notifyDecline(selectedInterest._id);
                      },
                      "Interest declined and notification processed."
                    )
                  }
                >
                  {busy === "decline" ? "Declining..." : "Decline interest"}
                </button>
              )}
              {selectedInterest && !selectedInterest.matchId && isOpenInterest(selectedInterest.status) && <button type="button" className="btn" disabled={busy !== null} onClick={() => void run("close", () => data.actions.updateInterestStatus(selectedInterest._id, "closed"), "Interest closed.")}>Close interest</button>}
              {!isManualMatchDraft(selectedMatch) && (selectedMatch ?? selectedInterest?.match)?.status === "paused" && <button type="button" className="btn" disabled={busy !== null} onClick={() => void run("resume", () => data.actions.resumeMatch((selectedMatch ?? selectedInterest!.match)!._id), "Match resumed.")}>Resume</button>}
              {selectedMatch && <MatchmakerActions match={selectedMatch} male={selectedMatch.maleRegistration} female={selectedMatch.femaleRegistration} onMessage={setMessage} />}
              <ContactRelease match={selectedMatch ?? selectedInterest?.match ?? null} femaleInterestId={selectedInterest?.femaleWorkflow ? selectedInterest._id : selectedMatch?.interest?.femaleWorkflow ? selectedMatch.interest._id : undefined} onMessage={setMessage} />
              {!isMatchmaker(selectedMatch) && !selectedInterest?.femaleWorkflow && !(selectedInterest?.fromRegistration?.gender === "female") && !selectedMatch?.interest?.femaleWorkflow && <ShareProfileAction key={`requester-${left?._id}-${right?._id}`} role="Requester" interest={selectedInterest ?? selectedMatch?.interest} matchId={selectedMatch?._id} owner={left} recipient={right} onMessage={setMessage} />}
              {!isMatchmaker(selectedMatch) && !selectedInterest?.femaleWorkflow && !(selectedInterest?.fromRegistration?.gender === "female") && !selectedMatch?.interest?.femaleWorkflow && <ShareProfileAction key={`target-${right?._id}-${left?._id}`} role="Target" interest={selectedInterest ?? selectedMatch?.interest} matchId={selectedMatch?._id} owner={right} recipient={left} onMessage={setMessage} />}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function InboxPageClient() {
  const data = useMatchingData();
  const [message, setMessage] = useState<string | null>(null);
  const [openProfileId, setOpenProfileId] = useState<string | null>(null);
  const notifyDecline = useNotifyDecline();
  const notifyMatch = useNotifyMatch();
  const openProfile = openProfileId ? data.registrations.find((registration) => registration._id === openProfileId) : null;

  const rows = useMemo(() => {
    const pendingInterests = data.interests
      .filter((interest) => !isArchivedInterest(interest))
      .map((interest) => ({
        id: `interest-${interest._id}`,
        kind: "Pending interest",
        tone: "amber" as const,
        createdAt: interest.updatedAt ?? interest.createdAt ?? interest._creationTime,
        primary: interest.fromRegistration,
        secondary: interest.toRegistration,
        body: `${titleize(interest.visibility)} · ${titleize(interest.source)}`,
        action: "Open workbench",
        href: `/admin/workbench?interest=${interest._id}`,
      }));
    const declineNotices = data.interests
      .filter((interest) => !interest.femaleWorkflow && interest.status === "declined" && !interest.declineNotificationSentAt)
      .map((interest) => ({
        id: `decline-${interest._id}`,
        kind: interest.declineNotificationError ? "Notice retry" : "Decline notice",
        tone: "rose" as const,
        createdAt: interest.updatedAt,
        primary: interest.fromRegistration,
        secondary: interest.toRegistration,
        body: interest.declineNotificationError ?? "Requester has not been notified.",
        action: "Send notice",
        run: async () => notifyDecline(interest._id),
      }));
    const profileShares = data.profileShares
      .filter((share) => ATTENTION_SHARE_STATUSES.includes(share.status))
      .map((share) => ({
        id: `share-${share._id}`,
        kind: "Profile share",
        tone: "blue" as const,
        createdAt: share.updatedAt,
        primary: share.recipient,
        secondary: share.owner,
        body: `Share ${titleize(share.status)} · ${share.includeImages ? "with photos" : "without photos"}`,
        action: "Open profiles",
        href: "/admin/profiles",
      }));
    const matchFailures = data.matches
      .filter((match) => !isManualMatchDraft(match) && !match.interest?.femaleWorkflow && Boolean(match.matchNotificationError))
      .map((match) => ({
        id: `match-${match._id}`,
        kind: "Match notification failed",
        tone: "rose" as const,
        createdAt: match.updatedAt,
        primary: match.maleRegistration,
        secondary: match.femaleRegistration,
        body: match.matchNotificationError ?? "Notification failed.",
        action: "Retry match email",
        run: async () => notifyMatch(match._id),
      }));

    return [...declineNotices, ...matchFailures, ...pendingInterests, ...profileShares].sort(
      (a, b) => b.createdAt - a.createdAt
    );
  }, [data.interests, data.matches, data.profileShares, notifyDecline, notifyMatch]);

  const runRowAction = async (row: (typeof rows)[number]) => {
    if (!("run" in row) || !row.run) return;
    try {
      const result = await row.run();
      setMessage(typeof result === "string" ? result : "Action completed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <>
      <FemaleWorkflowOutbox />
      <PageHead
        title={<><em>Inbox</em></>}
        subtitle="Signals that need admin attention across interests, shares, and match notifications."
      />
      <Notice text={message} />
      {data.isLoading ? (
        <LoadingPanel />
      ) : (
        <div className="panel">
          {rows.length === 0 ? (
            <EmptyState body="No matching work needs attention right now." />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>People</th>
                  <th>Details</th>
                  <th>Updated</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td><Pill tone={row.tone}>{row.kind}</Pill></td>
                    <td>
                      <div style={{ display: "grid", gap: 8 }}>
                        <button type="button" onClick={() => row.primary && setOpenProfileId(row.primary._id)} style={{ textAlign: "left" }}>
                          <ApplicantMini registration={row.primary} number={row.primary ? data.registrationNumbers.get(row.primary._id) : undefined} />
                        </button>
                        <button type="button" onClick={() => row.secondary && setOpenProfileId(row.secondary._id)} style={{ textAlign: "left" }}>
                          <ApplicantMini registration={row.secondary} number={row.secondary ? data.registrationNumbers.get(row.secondary._id) : undefined} />
                        </button>
                      </div>
                    </td>
                    <td style={{ color: "var(--ink-2)" }}>{row.body}</td>
                    <td className="mono" style={{ color: "var(--mute)" }}>{formatDateTime(row.createdAt)}</td>
                    <td style={{ textAlign: "right" }}>
                      {"href" in row && row.href ? (
                        <Link className="btn btn-sm" href={row.href}>{row.action}</Link>
                      ) : (
                        <button className="btn btn-sm" type="button" onClick={() => void runRowAction(row)}>
                          {row.action}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      <DetailPane
        open={Boolean(openProfile)}
        onClose={() => setOpenProfileId(null)}
        header={openProfile ? <ApplicantLink registration={openProfile} number={data.registrationNumbers.get(openProfile._id)} /> : null}
      >
        {openProfile && (
          <div style={{ padding: 20 }}>
            <ProfileComparison
              left={openProfile}
              right={null}
              leftNumber={data.registrationNumbers.get(openProfile._id)}
            />
          </div>
        )}
      </DetailPane>
    </>
  );
}
