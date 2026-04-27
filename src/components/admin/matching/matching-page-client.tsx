"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
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
type InterestAdminStatus = NonNullable<Doc<"interests">["adminStatus"]>;
type MatchStatus = Doc<"matches">["status"];
type ShareStatus = Doc<"profileShares">["status"];

type InterestRecord = Doc<"interests"> & {
  fromRegistration: RegistrationWithImages | null;
  toRegistration: RegistrationWithImages | null;
  match: Doc<"matches"> | null;
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

const INTEREST_STATUSES: InterestStatus[] = [
  "new",
  "queued",
  "active",
  "deferred",
  "declined",
  "closed",
  "converted_to_match",
];
const ADMIN_STATUSES: InterestAdminStatus[] = ["pending", "requested", "declined", "matched"];
const MATCH_STATUSES: MatchStatus[] = ["new", "reviewing", "contact_shared", "paused", "closed", "declined"];
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

function isOpenInterest(status: InterestStatus) {
  return status === "new" || status === "queued" || status === "active" || status === "deferred";
}

function useMatchingData() {
  const interestsRaw = useQuery(api.interests.getAll);
  const matchesRaw = useQuery(api.matches.getAll);
  const profileSharesRaw = useQuery(api.profileShares.getAll);
  const registrationsData = useRegistrations();

  const updateInterestStatus = useMutation(api.interests.updateStatus);
  const updateInterestAdminStatus = useMutation(api.interests.updateAdminStatus);
  const updateInterestNotes = useMutation(api.interests.updateNotes);
  const removeInterest = useMutation(api.interests.remove);
  const progressInterestFirst = useMutation(api.interests.progressFirst);
  const convertInterestToMatch = useMutation(api.interests.convertToMatch);
  const updateMatchStatus = useMutation(api.matches.updateStatus);
  const resetPair = useMutation(api.matches.resetPair);

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
    isLoading,
    interests,
    matches,
    profileShares,
    registrations: registrationsData.registrations,
    registrationNumbers: registrationsData.registrationNumbers,
    actions: {
      updateInterestStatus: (id: string, status: InterestStatus) =>
        updateInterestStatus({ id: id as Id<"interests">, status }),
      updateInterestAdminStatus: (id: string, adminStatus: InterestAdminStatus) =>
        updateInterestAdminStatus({ id: id as Id<"interests">, adminStatus }),
      updateInterestNotes: (id: string, notes: string) =>
        updateInterestNotes({ id: id as Id<"interests">, notes }),
      removeInterest: (id: string) => removeInterest({ id: id as Id<"interests"> }),
      progressInterestFirst: (id: string) => progressInterestFirst({ interestId: id as Id<"interests"> }),
      convertInterestToMatch: (id: string) => convertInterestToMatch({ interestId: id as Id<"interests"> }),
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
  }: {
    ownerRegistrationId: string;
    recipientRegistrationId: string;
    includeImages: boolean;
  }) => {
    const response = await fetch("/api/admin/create-profile-share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ownerRegistrationId, recipientRegistrationId, includeImages }),
    });
    const data = await response.json();
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
}: {
  interest: InterestRecord;
  data: MatchingData;
  onMessage: (message: string) => void;
}) {
  const notifyDecline = useNotifyDecline();
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
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
      {interest.status !== "active" && interest.status !== "converted_to_match" && (
        <button
          className="btn btn-sm"
          type="button"
          disabled={busy !== null}
          onClick={() =>
            run(
              "progress",
              () => data.actions.progressInterestFirst(interest._id),
              "Selected interest is now active."
            )
          }
        >
          {busy === "progress" ? "Updating..." : "Progress"}
        </button>
      )}
      {!interest.matchId && (
        <button
          className="btn btn-sm btn-primary"
          type="button"
          disabled={busy !== null}
          onClick={() =>
            run(
              "convert",
              () => data.actions.convertInterestToMatch(interest._id),
              "Interest converted to match."
            )
          }
        >
          {busy === "convert" ? "Converting..." : "Convert"}
        </button>
      )}
      {(interest.status === "declined" || interest.adminStatus === "declined") && (
        <button
          className="btn btn-sm"
          type="button"
          disabled={busy !== null}
          onClick={() => run("notify-decline", () => notifyDecline(interest._id), "Decline notification sent.")}
        >
          {busy === "notify-decline" ? "Sending..." : interest.declineNotificationError ? "Retry notice" : "Send notice"}
        </button>
      )}
      {!interest.matchId && (
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
    </div>
  );
}

function InterestRow({
  interest,
  data,
  numbers,
  onMessage,
}: {
  interest: InterestRecord;
  data: MatchingData;
  numbers: Map<string, number>;
  onMessage: (message: string) => void;
}) {
  const [updating, setUpdating] = useState(false);

  const updateStatus = async (status: InterestStatus) => {
    setUpdating(true);
    try {
      await data.actions.updateInterestStatus(interest._id, status);
      if (status === "declined") {
        const notifyDecline = await fetch("/api/admin/notify-decline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ interestId: interest._id }),
        });
        const notifyData = await notifyDecline.json();
        if (!notifyDecline.ok) throw new Error(notifyData.error || "Failed to send decline notification");
      }
      onMessage(status === "declined" ? "Interest declined and notification processed." : "Interest status updated.");
    } catch (error) {
      onMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setUpdating(false);
    }
  };

  const updateAdminStatus = async (adminStatus: InterestAdminStatus) => {
    setUpdating(true);
    try {
      await data.actions.updateInterestAdminStatus(interest._id, adminStatus);
      if (adminStatus === "declined") {
        const notifyDecline = await fetch("/api/admin/notify-decline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ interestId: interest._id }),
        });
        const notifyData = await notifyDecline.json();
        if (!notifyDecline.ok) throw new Error(notifyData.error || "Failed to send decline notification");
      }
      onMessage(
        adminStatus === "declined"
          ? "Interest admin status declined and notification processed."
          : "Interest admin status updated."
      );
    } catch (error) {
      onMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setUpdating(false);
    }
  };

  return (
    <tr>
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
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          <StatusPill status={interest.status} />
          <StatusPill status={interest.adminStatus ?? "pending"} />
          <Pill tone={interest.visibility === "internal_only" ? "blue" : "plain"}>
            {titleize(interest.visibility)}
          </Pill>
          <Pill tone="plain">{titleize(interest.source)}</Pill>
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
      <td>
        <div style={{ display: "grid", gap: 10 }}>
          <AdminSelect
            label="Workflow"
            value={interest.status}
            values={INTEREST_STATUSES}
            onChange={updateStatus}
          />
          <AdminSelect
            label="Admin"
            value={interest.adminStatus ?? "pending"}
            values={ADMIN_STATUSES}
            onChange={updateAdminStatus}
          />
          {updating && <span style={{ color: "var(--mute)", fontSize: 11 }}>Updating...</span>}
        </div>
      </td>
      <td style={{ minWidth: 220 }}>
        <NotesEditor
          initialValue={interest.notes}
          placeholder="Interest notes..."
          onSave={(notes) => data.actions.updateInterestNotes(interest._id, notes)}
        />
      </td>
      <td>
        <InterestActions interest={interest} data={data} onMessage={onMessage} />
      </td>
    </tr>
  );
}

export function InterestsPageClient() {
  const data = useMatchingData();
  const [status, setStatus] = useState<InterestStatus | "all">("all");
  const [visibility, setVisibility] = useState<"all" | "internal_only" | "admin_actionable">("all");
  const [adminStatus, setAdminStatus] = useState<InterestAdminStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.interests
      .filter((interest) => status === "all" || interest.status === status)
      .filter((interest) => visibility === "all" || interest.visibility === visibility)
      .filter((interest) => adminStatus === "all" || (interest.adminStatus ?? "pending") === adminStatus)
      .filter((interest) => {
        if (!q) return true;
        return [interest.fromRegistration?.name, interest.toRegistration?.name, interest.notes, interest.source]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(q));
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [adminStatus, data.interests, search, status, visibility]);

  return (
    <>
      <PageHead
        title={<>Interest <em>signals</em></>}
        subtitle="Review interest signals, manage the queue, and convert selected pairs into matches."
      />
      <Notice text={message} />
      {data.isLoading ? (
        <LoadingPanel />
      ) : (
        <div className="panel">
          <div className="tabs">
            <button className={`tab ${status === "all" ? "active" : ""}`} onClick={() => setStatus("all")}>
              All <span className="cnt">{data.interests.length}</span>
            </button>
            {INTEREST_STATUSES.map((item) => (
              <button
                key={item}
                className={`tab ${status === item ? "active" : ""}`}
                onClick={() => setStatus(item)}
              >
                {titleize(item)} <span className="cnt">{data.interests.filter((interest) => interest.status === item).length}</span>
              </button>
            ))}
          </div>
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
            {(["all", ...ADMIN_STATUSES] as const).map((item) => (
              <button
                key={item}
                type="button"
                className={`filt ${adminStatus === item ? "active" : ""}`}
                onClick={() => setAdminStatus(item)}
              >
                {item === "all" ? "All admin" : titleize(item)}
              </button>
            ))}
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
                  <th>Status</th>
                  <th>Change</th>
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
          <StatusPill status={match.status} />
          <ApplicantMini registration={match.maleRegistration} number={match.maleRegistration ? numbers.get(match.maleRegistration._id) : undefined} />
          <ApplicantMini registration={match.femaleRegistration} number={match.femaleRegistration ? numbers.get(match.femaleRegistration._id) : undefined} />
        </div>
        <span className="mono" style={{ color: "var(--mute)" }}>{formatDate(match.updatedAt)}</span>
      </div>

      <AdminSelect
        label="Match status"
        value={match.status}
        values={MATCH_STATUSES}
        onChange={(nextStatus) =>
          void run(
            "status",
            () => data.actions.updateMatchStatus(match._id, nextStatus, match.adminNotes),
            "Match status updated."
          )
        }
      />

      <NotesEditor
        initialValue={match.adminNotes}
        placeholder="Match notes..."
        onSave={(notes) => data.actions.updateMatchStatus(match._id, match.status, notes)}
      />

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
    const map = new Map<MatchStatus, MatchRecord[]>();
    for (const status of MATCH_STATUSES) map.set(status, []);
    for (const match of data.matches) {
      map.get(match.status)?.push(match);
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
        subtitle="Advance matches from review to contact shared, notify applicants, and release queues when matches close."
      />
      <Notice text={message} />
      {data.isLoading ? (
        <LoadingPanel />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          {MATCH_STATUSES.map((status) => {
            const matches = grouped.get(status) ?? [];
            return (
              <section key={status} className="panel" style={{ minHeight: 240 }}>
                <div className="panel-head">
                  <h3>{titleize(status)}</h3>
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
  owner,
  recipient,
  onMessage,
}: {
  owner: Registration | null;
  recipient: Registration | null;
  onMessage: (message: string) => void;
}) {
  const createShare = useCreateProfileShare();
  const [includeImages, setIncludeImages] = useState(owner?.photoSharingPermission === "yes");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!owner || !recipient) return;
    setBusy(true);
    try {
      const shareUrl = await createShare({
        ownerRegistrationId: owner._id,
        recipientRegistrationId: recipient._id,
        includeImages,
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
        <input type="checkbox" checked={includeImages} onChange={(event) => setIncludeImages(event.target.checked)} />
        Include photos
      </label>
      <button className="btn btn-sm" type="button" onClick={create} disabled={busy || !owner || !recipient}>
        {busy ? "Creating..." : "Create share link"}
      </button>
    </div>
  );
}

export function WorkbenchPageClient() {
  const data = useMatchingData();
  const notifyDecline = useNotifyDecline();
  const [selectedInterestId, setSelectedInterestId] = useState<string>("");
  const [selectedMatchId, setSelectedMatchId] = useState<string>("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const interest = params.get("interest");
    const match = params.get("match");
    if (interest) setSelectedInterestId(interest);
    if (match) setSelectedMatchId(match);
  }, []);

  const selectedInterest =
    data.interests.find((interest) => interest._id === selectedInterestId) ??
    (selectedMatchId ? null : data.interests.find((interest) => isOpenInterest(interest.status)) ?? data.interests[0]) ??
    null;
  const selectedMatch = data.matches.find((match) => match._id === selectedMatchId) ?? (!selectedInterest ? data.matches[0] : null) ?? null;
  const left = selectedMatch?.maleRegistration ?? selectedInterest?.fromRegistration ?? null;
  const right = selectedMatch?.femaleRegistration ?? selectedInterest?.toRegistration ?? null;

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
      />
      <Notice text={message} />
      {data.isLoading ? (
        <LoadingPanel />
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          <div className="panel">
            <div className="filters">
              <label style={{ display: "grid", gap: 4, minWidth: 260, flex: 1 }}>
                <span className="mono" style={{ color: "var(--mute)", fontSize: 10 }}>Interest</span>
                <select
                  value={selectedInterest?._id ?? ""}
                  onChange={(event) => setSelectedInterestId(event.target.value)}
                  style={{ height: 36, border: "1px solid var(--line)", borderRadius: 6, padding: "0 10px" }}
                >
                  {data.interests.map((interest) => (
                    <option key={interest._id} value={interest._id}>
                      #{interest.fromRegistration ? data.registrationNumbers.get(interest.fromRegistration._id) : "-"} {interest.fromRegistration?.name ?? "Unknown"} to #{interest.toRegistration ? data.registrationNumbers.get(interest.toRegistration._id) : "-"} {interest.toRegistration?.name ?? "Unknown"} · {titleize(interest.status)}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "grid", gap: 4, minWidth: 260, flex: 1 }}>
                <span className="mono" style={{ color: "var(--mute)", fontSize: 10 }}>Match</span>
                <select
                  value={selectedMatch?._id ?? ""}
                  onChange={(event) => setSelectedMatchId(event.target.value)}
                  style={{ height: 36, border: "1px solid var(--line)", borderRadius: 6, padding: "0 10px" }}
                >
                  {data.matches.map((match) => (
                    <option key={match._id} value={match._id}>
                      #{match.maleRegistration ? data.registrationNumbers.get(match.maleRegistration._id) : "-"} {match.maleRegistration?.name ?? "Unknown"} + #{match.femaleRegistration ? data.registrationNumbers.get(match.femaleRegistration._id) : "-"} {match.femaleRegistration?.name ?? "Unknown"} · {titleize(match.status)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div style={{ padding: 16 }}>
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
              <h3>Action bar</h3>
            </div>
            <div style={{ padding: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              {selectedInterest && !selectedInterest.matchId && (
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    run("convert", () => data.actions.convertInterestToMatch(selectedInterest._id), "Interest converted to match.")
                  }
                >
                  {busy === "convert" ? "Converting..." : "Convert interest"}
                </button>
              )}
              {selectedInterest && (
                <button
                  className="btn"
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    run(
                      "decline",
                      async () => {
                        await data.actions.updateInterestStatus(selectedInterest._id, "declined");
                        await notifyDecline(selectedInterest._id);
                      },
                      "Interest declined and notification processed."
                    )
                  }
                >
                  {busy === "decline" ? "Declining..." : "Decline interest"}
                </button>
              )}
              {selectedMatch && (
                <button
                  className="btn"
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    run(
                      "contact",
                      () => data.actions.updateMatchStatus(selectedMatch._id, "contact_shared", selectedMatch.adminNotes),
                      "Match marked contact shared."
                    )
                  }
                >
                  {busy === "contact" ? "Updating..." : "Mark contact shared"}
                </button>
              )}
              <ShareProfileAction owner={left} recipient={right} onMessage={setMessage} />
              <ShareProfileAction owner={right} recipient={left} onMessage={setMessage} />
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
      .filter((interest) => (interest.adminStatus ?? "pending") === "pending" && isOpenInterest(interest.status))
      .map((interest) => ({
        id: `interest-${interest._id}`,
        kind: "Pending interest",
        tone: "amber" as const,
        createdAt: interest.updatedAt,
        primary: interest.fromRegistration,
        secondary: interest.toRegistration,
        body: `${titleize(interest.visibility)} · ${titleize(interest.source)}`,
        action: "Open workbench",
        href: `/admin/workbench?interest=${interest._id}`,
      }));
    const declineNotices = data.interests
      .filter((interest) => (interest.status === "declined" || interest.adminStatus === "declined") && !interest.declineNotificationSentAt)
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
      .filter((match) => Boolean(match.matchNotificationError))
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
