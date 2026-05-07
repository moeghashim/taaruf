"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PageHead } from "@/components/admin/layout/page-head";
import { Ico } from "@/components/admin/primitives/icons";
import { Pill } from "@/components/admin/primitives/status-pill";

const eventStatuses = ["draft", "scheduled", "completed", "cancelled"] as const;
const registrationStatuses = ["pending", "approved", "waitlisted", "rejected", "cancelled"] as const;
const attendanceStatuses = ["not_checked_in", "attended", "no_show"] as const;
const emailKinds = ["approved", "waitlisted", "confirmation_request", "cancelled", "reminder"] as const;

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

export function EventsPageClient() {
  const events = useQuery(api.events.getAll);
  const backfillStatus = useQuery(api.events.verifyEventBackfill);
  const createEvent = useMutation(api.events.create);
  const updateEvent = useMutation(api.events.update);
  const updateRegistrationStatus = useMutation(api.events.updateRegistrationStatus);
  const updateAttendanceStatus = useMutation(api.events.updateAttendanceStatus);
  const requestConfirmation = useMutation(api.events.requestConfirmation);
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
      status: "scheduled",
      maleCapacity: Number(form.maleCapacity),
      femaleCapacity: Number(form.femaleCapacity),
      carryOverWaitlist: true,
    });
    setSelectedEventId(result.eventId);
    setMessage(`Event created. Carryover added ${result.carryover?.carried ?? 0} waitlisted applicant(s).`);
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
    const response = await fetch("/api/admin/event-registration-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventRegistrationId, kind }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Failed to send email");
    setMessage(payload.alreadySent ? "Email was already sent." : "Email sent.");
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
                  <Pill>{titleize(event.status)}</Pill>
                  <span className="mono">
                    M {event.counts.malePending + event.counts.maleApproved}/{event.maleCapacity} · F {event.counts.femalePending + event.counts.femaleApproved}/{event.femaleCapacity}
                  </span>
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
            <select
              value={detail.status}
              onChange={(event) =>
                updateEvent({ eventId: detail._id, status: event.target.value as (typeof eventStatuses)[number] })
              }
            >
              {eventStatuses.map((status) => <option key={status} value={status}>{titleize(status)}</option>)}
            </select>
          </div>
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
          <div className="interest-list">
            {detail.registrations.map((row) => (
              <div key={row._id} className="interest-row">
                <div className="interest-row-main">
                  <h4>{row.registration?.name ?? "Unknown applicant"}</h4>
                  <p>{titleize(row.gender)} · {row.registration?.email ?? "-"}</p>
                </div>
                <div className="interest-row-meta">
                  <select
                    value={row.registrationStatus}
                    onChange={(event) =>
                      updateRegistrationStatus({
                        eventRegistrationId: row._id,
                        registrationStatus: event.target.value as (typeof registrationStatuses)[number],
                      })
                    }
                  >
                    {registrationStatuses.map((status) => <option key={status} value={status}>{titleize(status)}</option>)}
                  </select>
                  <select
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
                      <button type="button" className="btn" onClick={() => requestConfirmation({ eventRegistrationId: row._id })}>
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
