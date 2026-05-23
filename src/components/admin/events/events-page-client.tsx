"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PageHead } from "@/components/admin/layout/page-head";
import { Ico } from "@/components/admin/primitives/icons";
import { Pill } from "@/components/admin/primitives/status-pill";

const eventStatuses = ["draft", "scheduled", "completed", "cancelled"] as const;
const registrationDropdownStatuses = ["pending", "approved", "confirmed", "waitlisted", "rejected", "cancelled"] as const;
const registrationFilterStatuses = ["pending", "approved", "confirmed", "waitlisted", "rejected", "cancelled"] as const;
const profileApprovalStatuses = ["pending", "approved", "rejected"] as const;
const attendanceStatuses = ["not_checked_in", "attended", "no_show"] as const;
const emailKinds = ["approved", "waitlisted", "confirmation_request", "cancelled", "reminder"] as const;
const carryoverStatuses = ["waitlisted", "pending", "approved"] as const;

function titleize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateTime(timestamp?: number) {
  if (!timestamp) return "-";
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function monthCodeFromDate(value: string) {
  if (!value) return "";
  const date = new Date(value);
  return date.toLocaleString("en-US", { month: "short" }).toLowerCase() + String(date.getFullYear()).slice(-2);
}

function eventMonthFromDate(value: string) {
  if (!value) return "";
  return value.slice(0, 7);
}

function defaultEmailKind(status: string): (typeof emailKinds)[number] {
  if (status === "approved") return "approved";
  if (status === "waitlisted") return "waitlisted";
  if (status === "cancelled" || status === "rejected") return "cancelled";
  return "reminder";
}

function profileApprovalTone(status?: string) {
  if (status === "approved") return "green" as const;
  if (status === "rejected") return "rose" as const;
  return "amber" as const;
}

export function EventsPageClient() {
  const events = useQuery(api.events.getAll);
  const backfillStatus = useQuery(api.events.verifyEventBackfill);
  const createEvent = useMutation(api.events.create);
  const updateEvent = useMutation(api.events.update);
  const deleteEvent = useMutation(api.events.deleteEvent);
  const updateRegistrationStatus = useMutation(api.events.updateRegistrationStatus);
  const updateRegistrationConfirmation = useMutation(api.events.updateRegistrationConfirmation);
  const updateAttendanceStatus = useMutation(api.events.updateAttendanceStatus);
  const requestConfirmation = useMutation(api.events.requestConfirmation);
  const carryOverRegistrations = useMutation(api.events.carryOverRegistrations);
  const moveEventRegistrationsToAprilWaitlist = useMutation(api.events.moveEventRegistrationsToAprilWaitlist);
  const backfillApril = useMutation(api.events.backfillApril2026);
  const createRef = useRef<HTMLElement | null>(null);
  const detailRef = useRef<HTMLElement | null>(null);

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const detail = useQuery(
    api.events.getDetail,
    selectedEventId ? { eventId: selectedEventId as Id<"events"> } : "skip"
  );
  const [message, setMessage] = useState<string | null>(null);
  const [emailKindByRegistration, setEmailKindByRegistration] = useState<Record<string, (typeof emailKinds)[number]>>({});
  const [broadcastEmailKind, setBroadcastEmailKind] = useState<(typeof emailKinds)[number]>("reminder");
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [registrationStatusFilter, setRegistrationStatusFilter] = useState<"all" | (typeof registrationFilterStatuses)[number]>("all");
  const [profileApprovalFilter, setProfileApprovalFilter] = useState<"all" | (typeof profileApprovalStatuses)[number]>("all");
  const [registrationSearch, setRegistrationSearch] = useState("");
  const [carryoverSourceEventId, setCarryoverSourceEventId] = useState<string>("");
  const [selectedCarryoverStatuses, setSelectedCarryoverStatuses] = useState<Array<(typeof carryoverStatuses)[number]>>([
    "waitlisted",
  ]);
  const [form, setForm] = useState({
    startsAt: "",
    endsAt: "",
    title: "",
    eventCode: "",
    eventMonth: "",
    location: "",
    maleCapacity: "60",
    femaleCapacity: "60",
  });

  const sortedEvents = useMemo(() => events || [], [events]);
  const isBackfillReady = Boolean(backfillStatus?.readyToRequireInterestEventId);
  const eventRegistrationCount = useMemo(
    () => detail?.registrations.length ?? 0,
    [detail?.registrations]
  );
  const waitlistEntryCount = detail?.waitlistEntries.length ?? 0;
  const isAprilWaitlistEvent = detail?.eventCode === "apr26";
  const detailStats = useMemo(() => {
    const registrations = detail?.registrations ?? [];
    const waitlistEntries = detail?.waitlistEntries ?? [];
    const waitlistedRegistrations = registrations.filter((row) => row.registrationStatus === "waitlisted").length;

    return {
      total: registrations.length + waitlistEntries.length,
      approved: registrations.filter((row) => row.registrationStatus === "approved").length,
      pending: registrations.filter((row) => row.registrationStatus === "pending").length,
      rejected: registrations.filter((row) => row.registrationStatus === "rejected").length,
      waitlisted: waitlistedRegistrations + waitlistEntries.length,
      confirmed: registrations.filter((row) => row.confirmedAt).length,
      profileApproved: registrations.filter((row) => row.registration?.status === "approved").length,
      profilePending: registrations.filter((row) => row.registration?.status === "pending").length,
      profileRejected: registrations.filter((row) => row.registration?.status === "rejected").length,
      male: registrations.filter((row) => row.gender === "male").length +
        waitlistEntries.filter((row) => row.gender === "male").length,
      female: registrations.filter((row) => row.gender === "female").length +
        waitlistEntries.filter((row) => row.gender === "female").length,
    };
  }, [detail?.registrations, detail?.waitlistEntries]);
  const filteredRegistrations = useMemo(() => {
    const normalizedSearch = registrationSearch.trim().toLowerCase();
    return (detail?.registrations ?? []).filter((row) => {
      const statusMatches =
        registrationStatusFilter === "all" ||
        (registrationStatusFilter === "confirmed" ? Boolean(row.confirmedAt) : row.registrationStatus === registrationStatusFilter);
      if (!statusMatches) return false;
      const profileStatusMatches =
        profileApprovalFilter === "all" || row.registration?.status === profileApprovalFilter;
      if (!profileStatusMatches) return false;
      if (!normalizedSearch) return true;

      const applicantNumber = row.registration?.publicApplicantNumber;
      const applicantNumberText = applicantNumber === undefined ? "" : String(applicantNumber);
      const name = row.registration?.name?.toLowerCase() ?? "";
      const profileStatus = row.registration?.status?.toLowerCase() ?? "";
      return (
        name.includes(normalizedSearch) ||
        applicantNumberText.includes(normalizedSearch) ||
        profileStatus.includes(normalizedSearch)
      );
    });
  }, [detail?.registrations, profileApprovalFilter, registrationSearch, registrationStatusFilter]);

  useEffect(() => {
    if (!detail?._id || detail._id !== selectedEventId) return;
    detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [detail?._id, selectedEventId]);

  async function handleCreateEvent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const startsAt = new Date(form.startsAt).getTime();
    const endsAt = new Date(form.endsAt).getTime();
    const eventCode = form.eventCode.trim() || monthCodeFromDate(form.startsAt);
    const eventMonth = form.eventMonth.trim() || eventMonthFromDate(form.startsAt);
    const title = form.title.trim() || `1Plus1 Match Event - ${eventCode.charAt(0).toUpperCase()}${eventCode.slice(1)}`;

    const result = await createEvent({
      title,
      eventCode,
      eventMonth,
      series: "1plus1_match",
      location: form.location.trim(),
      startsAt,
      endsAt,
      status: "draft",
      maleCapacity: Number(form.maleCapacity),
      femaleCapacity: Number(form.femaleCapacity),
      carryOverWaitlist: true,
    });
    setSelectedEventId(result.eventId);
    setMessage(
      `Draft event created. Carryover added ${result.carryover?.carried ?? 0} waitlisted applicant(s). Publish it when you're ready for applicants to see it.`
    );
    setForm({
      startsAt: "",
      endsAt: "",
      title: "",
      eventCode: "",
      eventMonth: "",
      location: "",
      maleCapacity: "60",
      femaleCapacity: "60",
    });
  }

  async function sendEventEmail(eventRegistrationId: string, kind: (typeof emailKinds)[number]) {
    try {
      const response = await fetch("/api/admin/event-registration-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventRegistrationId, kind, force: true }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to send email");
      setMessage("Email sent.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleRequestConfirmation(eventRegistrationId: Id<"eventRegistrations">) {
    try {
      await requestConfirmation({ eventRegistrationId });
      const response = await fetch("/api/admin/event-registration-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventRegistrationId, kind: "confirmation_request", force: true }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to send confirmation request email");
      setMessage(
        "Confirmation requested and applicant notified."
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleRegistrationStatusChange(
    row: NonNullable<typeof detail>["registrations"][number],
    value: (typeof registrationDropdownStatuses)[number]
  ) {
    try {
      if (value === "confirmed") {
        await updateRegistrationConfirmation({ eventRegistrationId: row._id, confirmed: true });
        return;
      }

      await updateRegistrationStatus({
        eventRegistrationId: row._id,
        registrationStatus: value,
      });
      if (row.confirmedAt) {
        await updateRegistrationConfirmation({ eventRegistrationId: row._id, confirmed: false });
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleCarryover() {
    if (!detail?._id || !carryoverSourceEventId) return;
    const result = await carryOverRegistrations({
      sourceEventId: carryoverSourceEventId as Id<"events">,
      targetEventId: detail._id,
      sourceStatuses: selectedCarryoverStatuses,
    });
    setMessage(
      `Backfill complete. Copied ${result.copied}, already existed ${result.alreadyExists}, skipped for capacity ${result.skippedCapacity}.`
    );
  }

  async function handleMoveEventRegistrationsToAprilWaitlist() {
    if (!detail?._id || eventRegistrationCount === 0 || isAprilWaitlistEvent) return;
    if (
      !window.confirm(
        `Move all ${eventRegistrationCount} applicant(s) from ${detail.title} to the Apr26 waitlist and remove them from this event?`
      )
    ) {
      return;
    }

    const result = await moveEventRegistrationsToAprilWaitlist({ eventId: detail._id });
    setRegistrationStatusFilter("all");
    setMessage(
      `Moved ${result.moved} applicant(s) to the Apr26 waitlist. Removed ${result.removedFromSource} from this event. Already waitlisted ${result.alreadyWaitlisted}.`
    );
  }

  async function handleBroadcastEmail() {
    if (!detail?._id || detail.registrations.length === 0 || isBroadcasting) return;
    if (
      !window.confirm(
        `Broadcast ${titleize(broadcastEmailKind)} email to all ${detail.registrations.length} applicant(s) on ${detail.title}?`
      )
    ) {
      return;
    }

    setIsBroadcasting(true);
    let sent = 0;
    let alreadySent = 0;
    let failed = 0;

    for (const row of detail.registrations) {
      try {
        const response = await fetch("/api/admin/event-registration-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventRegistrationId: row._id, kind: broadcastEmailKind }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Failed to send email");
        if (payload.alreadySent) {
          alreadySent += 1;
        } else {
          sent += 1;
        }
      } catch {
        failed += 1;
      }
    }

    setIsBroadcasting(false);
    setMessage(`Broadcast complete. Sent ${sent}, already sent ${alreadySent}, failed ${failed}.`);
  }

  async function handleDeleteEvent() {
    if (!detail?._id) return;
    if (!window.confirm(`Delete ${detail.title}? This cannot be undone.`)) return;

    try {
      await deleteEvent({ eventId: detail._id });
      setSelectedEventId(null);
      setCarryoverSourceEventId("");
      setMessage("Event deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  function clearRegistrationFilters() {
    setRegistrationStatusFilter("all");
    setProfileApprovalFilter("all");
    setRegistrationSearch("");
  }

  function registrationLinkFor(eventCode: string) {
    if (typeof window === "undefined") return `/register/${encodeURIComponent(eventCode)}`;
    return `${window.location.origin}/register/${encodeURIComponent(eventCode)}`;
  }

  async function copyRegistrationLink(eventCode: string) {
    const link = registrationLinkFor(eventCode);
    await navigator.clipboard.writeText(link);
    setMessage(`Registration link copied: ${link}`);
  }

  return (
    <>
      <PageHead
        title={<><em>Events</em></>}
        subtitle="Create events, manage registration, and check attendees in."
        actions={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              createRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              window.setTimeout(() => {
                createRef.current?.querySelector<HTMLInputElement>("input")?.focus();
              }, 250);
            }}
          >
            {Ico.plus}
            <span>New event</span>
          </button>
        }
      />

      {message && <div className="panel" style={{ padding: 12, marginBottom: 16 }}>{message}</div>}

      <div className="admin-events-grid" style={{ display: "grid", gridTemplateColumns: "minmax(300px, 360px) minmax(0, 1fr)", gap: 16 }}>
        <section ref={createRef} className="panel admin-events-create" style={{ padding: 16 }}>
          <h3 style={{ marginBottom: 12 }}>Create Event</h3>
          <form onSubmit={handleCreateEvent} style={{ display: "grid", gap: 10 }}>
            <label className="field">
              <span>Starts</span>
              <input type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} required />
            </label>
            <label className="field">
              <span>Ends</span>
              <input type="datetime-local" value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} required />
            </label>
            <label className="field">
              <span>Title</span>
              <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="1Plus1 Match Event - May26" />
            </label>
            <label className="field">
              <span>Location</span>
              <input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} required />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label className="field">
                <span>Event code</span>
                <input value={form.eventCode} onChange={(event) => setForm({ ...form, eventCode: event.target.value })} placeholder="may26" />
              </label>
              <label className="field">
                <span>Event month</span>
                <input value={form.eventMonth} onChange={(event) => setForm({ ...form, eventMonth: event.target.value })} placeholder="2026-05" />
              </label>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label className="field">
                <span>Male cap</span>
                <input type="number" min="1" value={form.maleCapacity} onChange={(event) => setForm({ ...form, maleCapacity: event.target.value })} />
              </label>
              <label className="field">
                <span>Female cap</span>
                <input type="number" min="1" value={form.femaleCapacity} onChange={(event) => setForm({ ...form, femaleCapacity: event.target.value })} />
              </label>
            </div>
            <button className="btn btn-primary" type="submit">Create</button>
          </form>
          {backfillStatus && !isBackfillReady && (
            <button
              className="btn"
              type="button"
              style={{ marginTop: 12, width: "100%" }}
              onClick={async () => {
                const result = await backfillApril({});
                setMessage(`Backfill complete. Created ${result.attendanceRows} attendance row(s), patched ${result.patchedInterests} interest(s).`);
              }}
            >
              Run Apr26 Backfill
            </button>
          )}
          {backfillStatus && (
            <div style={{ marginTop: 12, fontSize: 12, color: "var(--ink-2)", display: "grid", gap: 4 }}>
              <div>Apr26 event: {backfillStatus.aprilEventExists ? "ready" : "missing"}</div>
              <div>Manual event: {backfillStatus.manualEventExists ? "ready" : "missing"}</div>
              <div>Interests missing event: {backfillStatus.interestsMissingEventId}</div>
              <div>Approved missing Apr26 attendance: {backfillStatus.approvedMissingAprilAttendance}</div>
              <Pill tone={backfillStatus.readyToRequireInterestEventId ? "green" : "gold"}>
                {backfillStatus.readyToRequireInterestEventId ? "Ready to require eventId" : "Backfill needed"}
              </Pill>
            </div>
          )}
        </section>

        <section className="panel" style={{ padding: 16 }}>
          <h3 style={{ marginBottom: 12 }}>Events</h3>
          <div className="interest-list">
            {sortedEvents.map((event) => (
              <button
                key={event._id}
                type="button"
                className={`interest-row ${selectedEventId === event._id ? "selected" : ""}`}
                onClick={() => setSelectedEventId(event._id)}
              >
                <div className="interest-row-main">
                  <h4>{event.title}</h4>
                  <p>{formatDateTime(event.startsAt)} · {event.location}</p>
                </div>
                <div className="interest-row-meta">
                  <Pill tone={event.status === "draft" ? "amber" : "plain"}>{titleize(event.status)}</Pill>
                  {event.status === "scheduled" && event.startsAt >= Date.now() && <Pill tone="green">Homepage</Pill>}
                  <span className="mono">
                    M {event.counts.malePending + event.counts.maleApproved}/{event.maleCapacity} · F {event.counts.femalePending + event.counts.femaleApproved}/{event.femaleCapacity}
                  </span>
                  {event.counts.maleWaitlisted + event.counts.femaleWaitlisted > 0 && (
                    <span className="mono">WL {event.counts.maleWaitlisted + event.counts.femaleWaitlisted}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>

      {detail && (
        <section ref={detailRef} className="panel" style={{ padding: 16, marginTop: 16, scrollMarginTop: 96 }}>
          <div className="panel-head">
            <div>
              <h3>{detail.title}</h3>
              <p>{formatDateTime(detail.startsAt)} · {detail.location}</p>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
              {(detail.status === "draft" || detail.status === "scheduled") && (
                <button
                  type="button"
                  className={detail.status === "draft" ? "btn btn-primary" : "btn"}
                  onClick={() =>
                    updateEvent({
                      eventId: detail._id,
                      status: detail.status === "draft" ? "scheduled" : "draft",
                    })
                  }
                  title={
                    detail.status === "draft"
                      ? "Make this event visible to applicants"
                      : "Hide this event from applicants"
                  }
                >
                  {detail.status === "draft" ? "Publish" : "Unpublish"}
                </button>
              )}
              <select
                value={detail.status}
                onChange={(event) =>
                  updateEvent({ eventId: detail._id, status: event.target.value as (typeof eventStatuses)[number] })
                }
              >
                {eventStatuses.map((status) => <option key={status} value={status}>{titleize(status)}</option>)}
              </select>
              <button
                type="button"
                className="btn"
                disabled={!detail.canDelete}
                title={detail.deleteBlockedReason ?? "Delete event"}
                style={detail.canDelete ? { color: "var(--color-destructive)", borderColor: "var(--color-destructive)" } : undefined}
                onClick={handleDeleteEvent}
              >
                Delete
              </button>
            </div>
          </div>
          <div
            style={{
              border: "1px solid var(--line)",
              background: "var(--paper)",
              borderRadius: 6,
              padding: "10px 12px",
              color: "var(--ink-2)",
              fontSize: 12,
              marginBottom: 12,
              display: "flex",
              gap: 10,
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
            }}
          >
            <span className="mono">{registrationLinkFor(detail.eventCode)}</span>
            <button type="button" className="btn btn-sm" onClick={() => copyRegistrationLink(detail.eventCode)}>
              Copy registration link
            </button>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
              gap: 8,
              marginBottom: 12,
            }}
          >
            {[
              ["Total", detailStats.total],
              ["Approved", detailStats.approved],
              ["Pending", detailStats.pending],
              ["Rejected", detailStats.rejected],
              ["Waitlisted", detailStats.waitlisted],
              ["Confirmed", detailStats.confirmed],
              ["Profiles approved", detailStats.profileApproved],
              ["Profiles pending", detailStats.profilePending],
              ["Profiles rejected", detailStats.profileRejected],
              ["Male", detailStats.male],
              ["Female", detailStats.female],
            ].map(([label, value]) => (
              <div
                key={label}
                style={{
                  border: "1px solid var(--line)",
                  background: "var(--paper)",
                  borderRadius: 6,
                  padding: "10px 12px",
                  minHeight: 62,
                }}
              >
                <div style={{ color: "var(--ink-2)", fontSize: 11, textTransform: "uppercase" }}>{label}</div>
                <div className="mono" style={{ fontSize: 22, marginTop: 4 }}>{value}</div>
              </div>
            ))}
          </div>
          {!detail.canDelete && detail.deleteBlockedReason && (
            <div
              style={{
                border: "1px solid var(--line)",
                background: "var(--bg-tint)",
                borderRadius: 6,
                padding: "10px 12px",
                color: "var(--ink-2)",
                fontSize: 12,
                marginBottom: 12,
              }}
            >
              {detail.deleteBlockedReason}
            </div>
          )}
          {(detail.status === "completed" || detail.status === "cancelled") && (
            <div
              style={{
                border: "1px solid var(--line)",
                background: "var(--bg-tint)",
                borderRadius: 6,
                padding: "10px 12px",
                color: "var(--ink-2)",
                fontSize: 12,
                marginBottom: 12,
              }}
            >
              Notification actions are hidden for {detail.status} events.
            </div>
          )}
          {detail.status !== "completed" && detail.status !== "cancelled" && (
            <div
              style={{
                border: "1px solid var(--line)",
                background: "var(--paper)",
                borderRadius: 6,
                padding: 12,
                marginBottom: 12,
                display: "grid",
                gap: 10,
              }}
            >
              <div>
                <h4 style={{ marginBottom: 4 }}>Event list actions</h4>
                <p style={{ color: "var(--ink-2)", fontSize: 12 }}>
                  Move this event roster to the Apr26 waitlist before backfilling a new event, or broadcast an event email to every applicant on this event.
                </p>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end" }}>
                <button
                  type="button"
                  className="btn"
                  disabled={eventRegistrationCount === 0 || isAprilWaitlistEvent}
                  title={isAprilWaitlistEvent ? "Apr26 is already the waitlist event" : undefined}
                  onClick={handleMoveEventRegistrationsToAprilWaitlist}
                >
                  Move Event Applicants to Apr26 Waitlist ({eventRegistrationCount})
                </button>
                <label className="field" style={{ minWidth: 220 }}>
                  <span>Broadcast email</span>
                  <select
                    value={broadcastEmailKind}
                    onChange={(event) => setBroadcastEmailKind(event.target.value as (typeof emailKinds)[number])}
                  >
                    {emailKinds.map((kind) => <option key={kind} value={kind}>{titleize(kind)}</option>)}
                  </select>
                </label>
                <button
                  type="button"
                  className="btn"
                  disabled={isBroadcasting || detail.registrations.length === 0}
                  onClick={handleBroadcastEmail}
                >
                  {isBroadcasting ? "Broadcasting..." : `Broadcast to All (${detail.registrations.length})`}
                </button>
              </div>
            </div>
          )}
          {detail.status !== "completed" && detail.status !== "cancelled" && (
            <div
              style={{
                border: "1px solid var(--line)",
                background: "var(--paper)",
                borderRadius: 6,
                padding: 12,
                marginBottom: 12,
                display: "grid",
                gap: 10,
              }}
            >
              <div>
                <h4 style={{ marginBottom: 4 }}>Backfill waitlist from another event</h4>
                <p style={{ color: "var(--ink-2)", fontSize: 12 }}>
                  Copy active waitlist entries, including the Apr26 waitlist, into this event as pending registrations.
                </p>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) auto", gap: 10, alignItems: "end" }}>
                <label className="field">
                  <span>Source event</span>
                  <select
                    value={carryoverSourceEventId}
                    onChange={(event) => setCarryoverSourceEventId(event.target.value)}
                  >
                    <option value="">Select event</option>
                    {sortedEvents
                      .filter((event) => event._id !== detail._id)
                      .map((event) => (
                        <option key={event._id} value={event._id}>
                          {event.title} · {formatDateTime(event.startsAt)}
                        </option>
                      ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="btn"
                  disabled={!carryoverSourceEventId || selectedCarryoverStatuses.length === 0}
                  onClick={handleCarryover}
                >
                  Backfill Waitlist
                </button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {carryoverStatuses.map((status) => (
                  <label key={status} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={selectedCarryoverStatuses.includes(status)}
                      onChange={(event) =>
                        setSelectedCarryoverStatuses((current) =>
                          event.target.checked
                            ? [...new Set([...current, status])]
                            : current.filter((value) => value !== status)
                        )
                      }
                    />
                    <span>{titleize(status)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          {waitlistEntryCount > 0 && (
            <div
              style={{
                border: "1px solid var(--line)",
                background: "var(--paper)",
                borderRadius: 6,
                padding: 12,
                marginBottom: 12,
                display: "grid",
                gap: 10,
              }}
            >
              <div>
                <h4 style={{ marginBottom: 4 }}>Event Waitlist ({waitlistEntryCount})</h4>
                <p style={{ color: "var(--ink-2)", fontSize: 12 }}>
                  These applicants are available to backfill into another scheduled event.
                </p>
              </div>
              <div className="interest-list">
                {detail.waitlistEntries.map((entry) => (
                  <div key={entry._id} className="interest-row">
                    <div className="interest-row-main">
                      <h4>{entry.registration?.name ?? "Unknown applicant"}</h4>
                      <p>
                        {entry.registration?.publicApplicantNumber ? `#${entry.registration.publicApplicantNumber} · ` : ""}
                        {titleize(entry.gender)} · {entry.registration?.email ?? "-"}
                      </p>
                    </div>
                    <div className="interest-row-meta">
                      {entry.registration?.publicApplicantNumber && (
                        <span className="mono">#{entry.registration.publicApplicantNumber}</span>
                      )}
                      <Pill tone="gold">Waitlist</Pill>
                      {entry.sourceEvent && <span>{entry.sourceEvent.title}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 10,
              alignItems: "end",
              marginBottom: 12,
            }}
          >
            <label className="field">
              <span>Registration status</span>
              <select
                value={registrationStatusFilter}
                onChange={(event) =>
                  setRegistrationStatusFilter(event.target.value as typeof registrationStatusFilter)
                }
              >
                <option value="all">All statuses</option>
                {registrationFilterStatuses.map((status) => (
                  <option key={status} value={status}>{titleize(status)}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Profile approval</span>
              <select
                value={profileApprovalFilter}
                onChange={(event) =>
                  setProfileApprovalFilter(event.target.value as typeof profileApprovalFilter)
                }
              >
                <option value="all">All approvals</option>
                {profileApprovalStatuses.map((status) => (
                  <option key={status} value={status}>{titleize(status)}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Name or applicant #</span>
              <input
                value={registrationSearch}
                onChange={(event) => setRegistrationSearch(event.target.value)}
                placeholder="Search name or number"
              />
            </label>
            <button
              type="button"
              className="btn"
              disabled={
                registrationStatusFilter === "all" &&
                profileApprovalFilter === "all" &&
                registrationSearch.trim() === ""
              }
              onClick={clearRegistrationFilters}
            >
              Clear
            </button>
          </div>
          <div style={{ color: "var(--ink-2)", fontSize: 12, marginBottom: 8 }}>
            Showing {filteredRegistrations.length} of {detail.registrations.length} registration(s).
          </div>
          <div className="interest-list">
            {filteredRegistrations.map((row) => (
              <div key={row._id} className="interest-row">
                <div className="interest-row-main">
                  <h4>
                    {row.registration?.publicApplicantNumber ? (
                      <span className="mono">#{row.registration.publicApplicantNumber} · </span>
                    ) : null}
                    {row.registration?.name ?? "Unknown applicant"}
                  </h4>
                  <p>
                    {titleize(row.gender)} · {row.registration?.email ?? "-"}
                  </p>
                </div>
                <div className="interest-row-meta">
                  {row.registration?.publicApplicantNumber && (
                    <Pill tone="blue">Applicant #{row.registration.publicApplicantNumber}</Pill>
                  )}
                  <Pill tone={profileApprovalTone(row.registration?.status)}>
                    Profile {titleize(row.registration?.status ?? "pending")}
                  </Pill>
                  {row.confirmedAt && (
                    <Pill tone="green">Confirmed {formatDateTime(row.confirmedAt)}</Pill>
                  )}
                  <select
                    aria-label="Event registration status"
                    title="Event registration status"
                    value={row.confirmedAt ? "confirmed" : row.registrationStatus}
                    onChange={(event) =>
                      handleRegistrationStatusChange(
                        row,
                        event.target.value as (typeof registrationDropdownStatuses)[number]
                      )
                    }
                  >
                    {registrationDropdownStatuses.map((status) => <option key={status} value={status}>{titleize(status)}</option>)}
                  </select>
                  <select
                    aria-label="Event attendance status"
                    title="Event attendance status"
                    value={row.attendanceStatus}
                    onChange={(event) =>
                      updateAttendanceStatus({
                        eventRegistrationId: row._id,
                        attendanceStatus: event.target.value as (typeof attendanceStatuses)[number],
                      })
                    }
                  >
                    {attendanceStatuses.map((status) => <option key={status} value={status}>{titleize(status)}</option>)}
                  </select>
                  {detail.status !== "completed" && detail.status !== "cancelled" && (
                    <>
                      <button type="button" className="btn" onClick={() => handleRequestConfirmation(row._id)}>
                        Request Confirm
                      </button>
                      <select
                        value={emailKindByRegistration[row._id] ?? defaultEmailKind(row.registrationStatus)}
                        onChange={(event) =>
                          setEmailKindByRegistration((current) => ({
                            ...current,
                            [row._id]: event.target.value as (typeof emailKinds)[number],
                          }))
                        }
                      >
                        {emailKinds.map((kind) => <option key={kind} value={kind}>{titleize(kind)}</option>)}
                      </select>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => sendEventEmail(row._id, emailKindByRegistration[row._id] ?? defaultEmailKind(row.registrationStatus))}
                      >
                        Send Email
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
