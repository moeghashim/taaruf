"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PageHead } from "@/components/admin/layout/page-head";
import { DetailPane } from "@/components/admin/layout/detail-pane";
import { Sparkline } from "@/components/admin/primitives/sparkline";
import { Donut } from "@/components/admin/primitives/donut";
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

  const completedProfiles = useMemo(
    () =>
      data.registrations.filter(
        (r) => !!r.describeYourself?.trim() && !!r.lookingFor?.trim() && r.paymentStatus === "paid"
      ).length,
    [data.registrations]
  );

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
        <div className="stat">
          <h4>Active members</h4>
          <div className="big">{data.counts.approved}</div>
          <div className="sub">
            <span>{data.counts.total} total registrations</span>
          </div>
          <Sparkline data={[1, 3, 5, data.counts.approved / 4, data.counts.approved / 2, data.counts.approved * 0.75, data.counts.approved, data.counts.approved]} />
        </div>
        <div className="stat">
          <h4>Pending review</h4>
          <div className="big">{data.counts.pending}</div>
          <div className="sub">
            {data.counts.pending > 0 ? (
              <span className="trend down">{data.counts.pending} awaiting</span>
            ) : (
              <span>All caught up</span>
            )}
          </div>
          <Sparkline data={[2, 1, 3, 2, 4, 3, data.counts.pending, data.counts.pending]} color="var(--amber)" />
        </div>
        <div className="stat">
          <h4>Completed profiles</h4>
          <div className="big">{completedProfiles}</div>
          <div className="sub">
            <span>{data.counts.approved > 0 ? Math.round((completedProfiles / data.counts.approved) * 100) : 0}% of approved</span>
          </div>
          <Sparkline data={[1, 2, 3, 4, 5, 6, completedProfiles, completedProfiles]} color="var(--accent-2)" />
        </div>
        <div className="stat">
          <h4>Waitlisted</h4>
          <div className="big">{data.counts.waitlisted}</div>
          <div className="sub">
            <span>Across both genders</span>
          </div>
          <Sparkline data={[0, 0, 1, 1, 2, 2, data.counts.waitlisted, data.counts.waitlisted]} color="var(--gold)" />
        </div>
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
            <h3>Registration pool</h3>
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
            <div>
              <Donut
                value={Math.min(data.counts.female, data.slotLimits.female)}
                max={data.slotLimits.female}
                label="Sisters"
              />
            </div>
            <div>
              <Donut
                value={Math.min(data.counts.male, data.slotLimits.male)}
                max={data.slotLimits.male}
                label="Brothers"
                color="var(--accent-2)"
              />
            </div>
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
            <span>Cap: {data.slotLimits.female} sisters · {data.slotLimits.male} brothers</span>
            <span className="mono">
              {Math.max(0, data.slotLimits.female - data.counts.female)} sister seats ·{" "}
              {Math.max(0, data.slotLimits.male - data.counts.male)} brother seats left
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
