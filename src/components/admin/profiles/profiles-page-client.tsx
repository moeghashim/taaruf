"use client";

import { useMemo, useState } from "react";
import { PageHead } from "@/components/admin/layout/page-head";
import { DetailPane } from "@/components/admin/layout/detail-pane";
import { Pill, StatusPill } from "@/components/admin/primitives/status-pill";
import { WhoCell } from "@/components/admin/primitives/who-cell";
import { Ico } from "@/components/admin/primitives/icons";
import { ProfileDetail } from "./profile-detail";
import {
  useRegistrations,
  type FilterGender,
  type FilterStatus,
} from "@/components/admin/hooks/use-registrations";

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
  { id: "waitlisted", label: "Waitlisted" },
];

export function ProfilesPageClient({
  initialStatus = "all",
  lockStatus = false,
  title,
  subtitle,
}: Props) {
  const data = useRegistrations();
  const [tab, setTab] = useState<FilterStatus>(initialStatus);
  const [gender, setGender] = useState<FilterGender>("all");
  const [search, setSearch] = useState("");
  const [openProfileId, setOpenProfileId] = useState<string | null>(null);

  const effectiveTab = lockStatus ? initialStatus : tab;
  const filtered = useMemo(
    () => data.filterRegistrations(effectiveTab, gender, search),
    [data, effectiveTab, gender, search]
  );

  const openProfile = openProfileId ? data.registrations.find((r) => r._id === openProfileId) : null;

  const exportCsv = () => {
    const headers = [
      "Number",
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
      r.education,
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
            <button className="btn" onClick={exportCsv}>Export CSV</button>
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
                  onClick={() => setTab(id)}
                >
                  {label} <span className="cnt">{c}</span>
                </button>
              );
            })}
          </div>
        )}

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
          <div style={{ marginLeft: "auto", fontSize: 11, color: "var(--mute)" }} className="mono">
            {filtered.length} shown
          </div>
        </div>

        {data.isLoading ? (
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
                <th>#</th>
                <th>Member</th>
                <th>Age</th>
                <th>Background</th>
                <th>Status</th>
                <th>Payment</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r._id} className="row-click" onClick={() => setOpenProfileId(r._id)}>
                  <td className="mono" style={{ color: "var(--mute)" }}>
                    {data.registrationNumbers.get(r._id)}
                  </td>
                  <td>
                    <WhoCell name={r.name} gender={r.gender} sub={r.email} />
                  </td>
                  <td>{r.age}</td>
                  <td style={{ fontSize: 12 }}>
                    <div>{r.maritalStatus || "—"}</div>
                    <div className="sub" style={{ color: "var(--mute)" }}>
                      {r.job || r.education || ""}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      <StatusPill status={r.status} />
                      {data.waitlistIds.has(r._id) && <Pill tone="gold">Waitlisted</Pill>}
                    </div>
                  </td>
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
                sub={`${openProfile.age} · ${openProfile.gender === "female" ? "Sister" : "Brother"}`}
              />
            </>
          ) : null
        }
      >
        {openProfile && (
          <ProfileDetail
            profile={openProfile}
            registrationNumber={data.registrationNumbers.get(openProfile._id)}
            isWaitlisted={data.waitlistIds.has(openProfile._id)}
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
