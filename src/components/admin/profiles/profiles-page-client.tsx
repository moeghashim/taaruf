"use client";
import { formatEducation } from "@/lib/education";

import { Component, Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageHead } from "@/components/admin/layout/page-head";
import { DetailPane } from "@/components/admin/layout/detail-pane";
import { Pill, StatusPill } from "@/components/admin/primitives/status-pill";
import { WhoCell } from "@/components/admin/primitives/who-cell";
import { Ico } from "@/components/admin/primitives/icons";
import { ProfileDetail } from "./profile-detail";
import { isArchivedProfile } from "@/lib/profile-archive-filter";
import {
  useRegistrations,
  type FilterGender,
  type FilterProfileCompletionStatus,
  type FilterStatus,
} from "@/components/admin/hooks/use-registrations";

import { useProfileEventPages } from "@/components/admin/hooks/use-profile-event-pages";
import type { Id } from "../../../../convex/_generated/dataModel";
import { eventMembershipStatuses, filterEventMembers, profilePage } from "@/lib/profile-event-filter";

type Props = {
  /** "all" lets the tabs choose; "pending" locks the surface to pending review. */
  initialStatus?: FilterStatus;
  /** Hide the status tabs entirely (used by the Pending review surface). */
  lockStatus?: boolean;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
};

function formatDate(timestamp?: number) {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const TAB_DEFS: Array<{ id: FilterStatus; label: string }> = [
  { id: "all", label: "All" },
  { id: "approved", label: "Approved" },
  { id: "pending", label: "Pending" },
  { id: "rejected", label: "Rejected" },
  { id: "archived", label: "Archived" },
];

const PROFILE_STATUS_DEFS: Array<{ id: FilterProfileCompletionStatus; label: string }> = [
  { id: "all", label: "All profiles" },
  { id: "completed", label: "Completed" },
  { id: "in_progress", label: "In progress" },
  { id: "not_started", label: "Not started" },
];

export function ProfilesPageClient(props: Props) {
  return <ProfilesErrorBoundary><Suspense fallback={<p>Loading profiles…</p>}><ProfilesContent {...props} /></Suspense></ProfilesErrorBoundary>;
}

class ProfilesErrorBoundary extends Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div role="alert" className="panel"><div className="filters"><p>Unable to load profiles or event registrations. Refresh to try again, or sign in again if your session expired.</p><button className="btn" onClick={() => window.location.reload()}>Refresh</button></div></div> : this.props.children;
  }
}

function ProfilesContent({
  initialStatus = "all",
  lockStatus = false,
  title,
  subtitle,
}: Props) {
  const data = useRegistrations();
  const catalog = useProfileEventPages("events.profileFilterCatalog", {});
  const events = catalog.rows;
  const [eventId, setEventId] = useState("all");
  const event = useProfileEventPages("events.profileFilterMembership", eventId === "all" ? "skip" : { eventId: eventId as Id<"events"> });
  const membership = useMemo(() => eventMembershipStatuses(event.rows ?? []), [event.rows]);
  const [pagination, setPagination] = useState({ key: "", page: 1 });
  const params = useSearchParams();
  const query = params.get("q") ?? "";
  const [tab, setTab] = useState<FilterStatus>(initialStatus);
  const [gender, setGender] = useState<FilterGender>("all");
  const [profileStatus, setProfileStatus] = useState<FilterProfileCompletionStatus>("all");
  const [search, setSearch] = useState(query);
  const [openProfileId, setOpenProfileId] = useState<string | null>(null);

  const effectiveTab = lockStatus ? initialStatus : tab;
  const filtered = useMemo(
    () => filterEventMembers(data.filterRegistrations(effectiveTab, gender, search, profileStatus), eventId === "all" ? null : membership),
    [data, effectiveTab, gender, profileStatus, search, eventId, membership]
  );

  const filterKey = JSON.stringify([effectiveTab, gender, search, profileStatus, eventId]);
  // Persist every filter transition so a round trip cannot resurrect an old page.
  if (pagination.key !== filterKey) setPagination({ key: filterKey, page: 1 });
  const { page, pages, rows } = profilePage(filtered, pagination.key === filterKey ? pagination.page : 1);
  const isLoading = data.isLoading || (eventId !== "all" && event.rows === undefined);

  useEffect(() => {
    setSearch(query);
    const requestedStatus = params.get("status");
    setTab(TAB_DEFS.find(item => item.id === requestedStatus)?.id ?? initialStatus);
    setEventId("all");
    setGender("all");
    setProfileStatus("all");
    setOpenProfileId(params.get("profile"));
  }, [params, query, initialStatus]);

  const openProfile = openProfileId ? data.registrations.find((r) => r._id === openProfileId) : null;

  const exportCsv = () => {
    const headers = [
      "Applicant Number",
      "Name",
      "Age",
      "Gender",
      "Status",
      "Marital Status",
      "Education",
      "Job",
      "Email",
      "Phone",
      "Describe Yourself",
      "Looking For",
      "Payment Status",
      "Date",
    ];
    const rows = filtered.map((r) => [
      data.registrationNumbers.get(r._id) ?? "",
      r.name,
      r.age,
      r.gender,
      r.status,
      r.maritalStatus,
      formatEducation(r.education),
      r.job,
      r.email,
      r.phone,
      (r.describeYourself ?? "").replace(/"/g, '""'),
      (r.lookingFor ?? "").replace(/"/g, '""'),
      r.paymentStatus ?? "",
      r._creationTime ? new Date(r._creationTime).toLocaleDateString() : "",
    ]);
    const csv = [
      headers.join(","),
      ...rows.map((row) => row.map((val) => `"${val}"`).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `registrations-${effectiveTab}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHead
        title={title}
        subtitle={subtitle ?? `${data.counts.total} total · ${data.counts.approved} approved · ${data.counts.pending} pending`}
        actions={
          <>
            <button className="btn" disabled={isLoading} onClick={exportCsv}>Export CSV</button>
          </>
        }
      />

      <div className="panel">
        {!lockStatus && (
          <div className="tabs">
            {TAB_DEFS.map(({ id, label }) => {
              const c = id === "all" ? data.counts.total : data.counts[id];
              return (
                <button
                  key={id}
                  type="button"
                  className={`tab ${tab === id ? "active" : ""}`}
                  aria-pressed={tab === id}
                  onClick={() => setTab(id)}
                >
                  {label} <span className="cnt">{c}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="filters">
          <label htmlFor="profile-event">Event registration</label>
          <select id="profile-event" className="filt" style={{ maxWidth: "100%", minHeight: 36 }} value={eventId} disabled={events === undefined} onChange={(e) => setEventId(e.target.value)}>
            <option value="all">All events</option>
            {events?.map((item) => <option key={item._id} value={item._id}>{item.title} · {new Date(item.startsAt).toLocaleDateString("en-US", { timeZone: "America/Chicago", year: "numeric", month: "short", day: "numeric" })}</option>)}
          </select>
        </div>
        {(catalog.error || (eventId !== "all" && event.error)) && <div role="alert" className="filters"><p>{catalog.error ? "Unable to load the complete event catalog." : "Unable to load event registrations."} Retry to load current results.</p><button className="btn" onClick={() => { catalog.retry(); event.retry(); }}>Retry</button></div>}
        {!events && !catalog.error && <p className="filters">Loading event catalog…</p>}
        {eventId !== "all" && <p className="filters">Includes all event registration statuses, regardless of check-in. Status tabs filter profile approval.</p>}
        <div className="filters">
          <div className="search-inline">
            <span className="glass">{Ico.search}</span>
            <input
              type="text"
              placeholder="Search by name, email, or phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            type="button"
            className={`filt ${gender === "all" ? "active" : ""}`}
            onClick={() => setGender("all")}
          >
            All members
          </button>
          <button
            type="button"
            className={`filt ${gender === "female" ? "active" : ""}`}
            onClick={() => setGender("female")}
          >
            Sisters
          </button>
          <button
            type="button"
            className={`filt ${gender === "male" ? "active" : ""}`}
            onClick={() => setGender("male")}
          >
            Brothers
          </button>
          {PROFILE_STATUS_DEFS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={`filt ${profileStatus === id ? "active" : ""}`}
              onClick={() => setProfileStatus(id)}
            >
              {label}
            </button>
          ))}
          <div style={{ marginLeft: "auto", fontSize: 11, color: "var(--mute)" }} className="mono">
            {isLoading ? "Loading…" : `${filtered.length} shown`}
          </div>
        </div>

        {isLoading ? (
          <div className="coming-soon" style={{ padding: "60px 20px" }}>
            <p>Loading…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="coming-soon" style={{ padding: "60px 20px" }}>
            <div className="lede">No matches.</div>
            <p>Adjust the filters or search to broaden the view.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Applicant #</th>
                <th>Member</th>
                <th>Age</th>
                <th scope="col">Ethnicity</th>
                <th>Background</th>
                <th>Profile status</th>
                {eventId !== "all" && <th>Event registration</th>}
                <th>Payment</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id} className="row-click" onClick={() => setOpenProfileId(r._id)}>
                  <td className="mono" style={{ color: "var(--mute)" }}>
                    {data.registrationNumbers.get(r._id)}
                  </td>
                  <td>
                    <WhoCell
                      name={r.name}
                      gender={r.gender}
                      applicantNumber={data.registrationNumbers.get(r._id)}
                      sub={r.email}
                      imageUrl={r.imageUrls?.[0]}
                    />
                  </td>
                  <td>{r.age}</td>
                  <td>{r.ethnicity?.trim() ? r.ethnicity : "Not provided"}</td>
                  <td style={{ fontSize: 12 }}>
                    <div>{r.maritalStatus || "—"}</div>
                    <div className="sub" style={{ color: "var(--mute)" }}>
                      {r.job || formatEducation(r.education)}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      <StatusPill status={r.status} />
                      {isArchivedProfile(r) && <Pill tone="plain">Archived</Pill>}
                    </div>
                  </td>
                  {eventId !== "all" && <td><div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{membership.get(r._id)?.map(status => <StatusPill key={status} status={status} />)}</div></td>}
                  <td>
                    {r.paymentStatus ? (
                      <StatusPill status={r.paymentStatus} />
                    ) : (
                      <Pill tone="plain">—</Pill>
                    )}
                  </td>
                  <td className="mono" style={{ color: "var(--mute)" }}>
                    {formatDate(r._creationTime)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!isLoading && filtered.length > 0 && <nav className="filters" aria-label="Profiles pagination"><button className="btn" disabled={page === 1} onClick={() => setPagination({ key: filterKey, page: page - 1 })}>Previous</button><span aria-live="polite">Page {page} of {pages}</span><button className="btn" disabled={page === pages} onClick={() => setPagination({ key: filterKey, page: page + 1 })}>Next</button></nav>}
      </div>

      <DetailPane
        open={!!openProfile}
        onClose={() => setOpenProfileId(null)}
        header={
          openProfile ? (
            <>
              <WhoCell
                name={openProfile.name}
                gender={openProfile.gender}
                applicantNumber={data.registrationNumbers.get(openProfile._id)}
                sub={`${openProfile.age} · ${openProfile.gender === "female" ? "Sister" : "Brother"}`}
                imageUrl={openProfile.imageUrls?.[0]}
              />
            </>
          ) : null
        }
      >
        {openProfile && (
          <ProfileDetail
            profile={openProfile}
            registrationNumber={data.registrationNumbers.get(openProfile._id)}
            onUpdateNotes={data.actions.updateAdminNotes}
            onUpdateStatus={data.actions.updateStatus}
            onDelete={data.actions.deleteRegistration}
            onClose={() => setOpenProfileId(null)}
          />
        )}
      </DetailPane>
    </>
  );
}
