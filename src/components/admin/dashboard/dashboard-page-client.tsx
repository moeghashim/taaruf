"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PageHead } from "@/components/admin/layout/page-head";
import { DetailPane } from "@/components/admin/layout/detail-pane";
import { Pill, StatusPill } from "@/components/admin/primitives/status-pill";
import { WhoCell } from "@/components/admin/primitives/who-cell";
import { Ico } from "@/components/admin/primitives/icons";
import { ProfileDetail } from "@/components/admin/profiles/profile-detail";
import { useRegistrations } from "@/components/admin/hooks/use-registrations";
import { useAdminName } from "@/components/admin/hooks/use-admin-name";

function formatDate(timestamp?: number) {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function todayLabel() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

/**
 * Dashboard surface — KPIs, registration pool donuts, and a queue of
 * pending registrations that need admin attention. Activity feed is
 * intentionally hidden until there's an event source to feed it.
 */
export function DashboardPageClient() {
  const data = useRegistrations();
  const adminName = useAdminName();
  const [openProfileId, setOpenProfileId] = useState<string | null>(null);

  // Pending registrations sorted oldest-first (longest-waiting first).
  const pendingQueue = useMemo(
    () =>
      [...data.registrations]
        .filter((r) => r.status === "pending")
        .sort((a, b) => a._creationTime - b._creationTime)
        .slice(0, 5),
    [data.registrations]
  );

  const openProfile = openProfileId
    ? data.registrations.find((r) => r._id === openProfileId)
    : null;

  const greeting = adminName ? (
    <>
      Assalāmu <em>ʿalaykum</em>, {adminName}.
    </>
  ) : (
    <>
      Assalāmu <em>ʿalaykum</em>.
    </>
  );

  const subtitleBits: string[] = [todayLabel()];
  if (data.counts.pending > 0) {
    subtitleBits.push(
      `${data.counts.pending} registration${data.counts.pending === 1 ? "" : "s"} awaiting review`
    );
  }

  return (
    <>
      <PageHead
        title={greeting}
        subtitle={subtitleBits.join(" · ")}
        actions={
          <>
            <Link href="/admin/profiles" className="btn">
              View profiles
            </Link>
            <Link href="/admin/pending" className="btn btn-primary">
              {Ico.plus}
              <span className="btn-label">Review pending</span>
            </Link>
          </>
        }
      />

      <div className="stats">
        {[
          { label: "Approved applicants", count: data.counts.approved, href: "/admin/profiles?status=approved" },
          { label: "Pending review", count: data.counts.pending, href: "/admin/pending" },
          { label: "All applicants", count: data.counts.total, href: "/admin/profiles" },
          { label: "Event waitlist", count: data.counts.waitlisted, href: "/admin/profiles?status=waitlisted" },
        ].map(metric => <Link key={metric.label} href={metric.href} className="stat" style={{ color: "inherit", textDecoration: "none" }}><h4>{metric.label}</h4><div className="big">{data.isLoading ? "—" : metric.count}</div></Link>)}
      </div>

      <div className="two-col">
        <div className="panel">
          <div className="panel-head">
            <h3>Needs your attention</h3>
            <div className="tools">
              <Link href="/admin/pending" className="btn btn-sm">
                View all
              </Link>
            </div>
          </div>
          {data.isLoading ? (
            <div className="coming-soon" style={{ padding: "60px 20px" }}>
              <p>Loading…</p>
            </div>
          ) : pendingQueue.length === 0 ? (
            <div className="coming-soon" style={{ padding: "60px 20px" }}>
              <div className="lede">All caught up.</div>
              <p>No registrations are waiting for review right now.</p>
            </div>
          ) : (
            <div>
              {pendingQueue.map((r, idx) => (
                <div className="qcard" key={r._id} onClick={() => setOpenProfileId(r._id)}>
                  <div className="rank">{idx + 1}</div>
                  <div>
                    <WhoCell name={r.name} gender={r.gender} sub={r.email} imageUrl={r.imageUrls?.[0]} />
                    <div style={{ fontSize: 11, color: "var(--mute)", marginTop: 6 }}>
                      Registered {formatDate(r._creationTime)}
                      {r.paymentStatus === "paid" ? " · payment confirmed" : " · payment " + (r.paymentStatus ?? "unknown")}
                    </div>
                  </div>
                  <StatusPill status={r.status} />
                  {data.waitlistIds.has(r._id) ? <Pill tone="gold">Waitlist</Pill> : <span />}
                  <div className="actions">
                    <button className="btn btn-sm btn-ghost">Open</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>Applicant pool</h3>
            <Link href="/admin/profiles" className="btn btn-sm btn-ghost">
              View
            </Link>
          </div>
          <div
            style={{
              padding: "24px 20px 28px",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 20,
              alignItems: "center",
            }}
          >
            {[
              { label: "Sisters", value: data.counts.female, color: "var(--rose)" },
              { label: "Brothers", value: data.counts.male, color: "var(--accent-2)" },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  padding: 18,
                  background: "var(--panel)",
                }}
              >
                <div style={{ fontSize: 11, color: "var(--mute)", marginBottom: 6 }}>
                  {item.label}
                </div>
                <div style={{ fontSize: 34, lineHeight: 1, fontWeight: 650, color: item.color }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
          <div
            style={{
              padding: "0 20px 20px",
              display: "flex",
              justifyContent: "space-between",
              fontSize: 11,
              color: "var(--mute)",
            }}
          >
            <span>Registration capacity is managed per event.</span>
            <span className="mono">
              {data.counts.approved} approved · {data.counts.pending} pending
            </span>
          </div>
        </div>
      </div>

      <DetailPane
        open={!!openProfile}
        onClose={() => setOpenProfileId(null)}
        header={
          openProfile ? (
            <WhoCell
              name={openProfile.name}
              gender={openProfile.gender}
              sub={`${openProfile.age} · ${openProfile.gender === "female" ? "Sister" : "Brother"}`}
              imageUrl={openProfile.imageUrls?.[0]}
            />
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
