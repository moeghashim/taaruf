"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { PageHead } from "@/components/admin/layout/page-head";
import { Pill } from "@/components/admin/primitives/status-pill";
import { useRegistrations } from "@/components/admin/hooks/use-registrations";
import { api } from "../../../../convex/_generated/api";

type FixResult =
  | { ok: true; sessionsChecked: number; fixed: number; emailsSent: number }
  | { ok: false; error: string };

/**
 * Settings surface — re-skinned slot-cap controls, payment
 * reconciliation, and admin display name editor. All actions hit
 * Convex mutations or the existing /api/admin/fix-payments route.
 */
export function SettingsPageClient() {
  const data = useRegistrations();
  const adminNameValue = useQuery(api.settings.get, { key: "admin_name" });
  const setSetting = useMutation(api.settings.set);

  // Slot caps
  const [maleSlots, setMaleSlots] = useState<string>("");
  const [femaleSlots, setFemaleSlots] = useState<string>("");
  const [savingSlots, setSavingSlots] = useState(false);
  const [slotsSavedAt, setSlotsSavedAt] = useState<number | null>(null);

  // Admin name
  const [adminName, setAdminName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameSavedAt, setNameSavedAt] = useState<number | null>(null);

  // Fix payments
  const [fixingPayments, setFixingPayments] = useState(false);
  const [fixResult, setFixResult] = useState<FixResult | null>(null);

  // Hydrate inputs once the queries resolve.
  useEffect(() => {
    if (data.slotLimits.raw) {
      setMaleSlots(String(data.slotLimits.raw.maleSlots));
      setFemaleSlots(String(data.slotLimits.raw.femaleSlots));
    }
  }, [data.slotLimits.raw]);

  useEffect(() => {
    if (typeof adminNameValue === "string") {
      setAdminName(adminNameValue);
    } else if (adminNameValue === null) {
      setAdminName("");
    }
  }, [adminNameValue]);

  const slotsDirty =
    !!data.slotLimits.raw &&
    (Number(maleSlots) !== data.slotLimits.raw.maleSlots ||
      Number(femaleSlots) !== data.slotLimits.raw.femaleSlots);

  const nameDirty = adminName.trim() !== (typeof adminNameValue === "string" ? adminNameValue : "");

  const saveSlots = async () => {
    if (!slotsDirty) return;
    const m = Number(maleSlots);
    const f = Number(femaleSlots);
    if (!Number.isFinite(m) || m < 0 || !Number.isFinite(f) || f < 0) {
      alert("Slot caps must be non-negative numbers.");
      return;
    }
    setSavingSlots(true);
    try {
      await data.actions.updateSlotLimits(m, f);
      setSlotsSavedAt(Date.now());
    } finally {
      setSavingSlots(false);
    }
  };

  const saveName = async () => {
    if (!nameDirty) return;
    setSavingName(true);
    try {
      await setSetting({ key: "admin_name", value: adminName.trim() });
      setNameSavedAt(Date.now());
    } finally {
      setSavingName(false);
    }
  };

  const runFixPayments = async () => {
    setFixingPayments(true);
    setFixResult(null);
    try {
      const response = await fetch("/api/admin/fix-payments", { method: "POST" });
      const body = await response.json();
      if (response.ok) {
        setFixResult({
          ok: true,
          sessionsChecked: body.sessionsChecked ?? 0,
          fixed: body.fixed ?? 0,
          emailsSent: body.emailsSent ?? 0,
        });
      } else {
        setFixResult({ ok: false, error: body.error ?? "Unknown error." });
      }
    } catch (err) {
      console.error("Fix payments error:", err);
      setFixResult({ ok: false, error: "Request failed. Please try again." });
    } finally {
      setFixingPayments(false);
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

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 12px",
    border: "1px solid var(--line)",
    borderRadius: 6,
    background: "var(--panel)",
    fontSize: 13,
  };

  const fieldLabel: React.CSSProperties = {
    fontSize: 11,
    color: "var(--mute)",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    marginBottom: 6,
    display: "block",
  };

  return (
    <>
      <PageHead
        title={<><em>Settings</em></>}
        subtitle="Slot caps, payment reconciliation, and admin display name."
      />

      <div style={{ display: "grid", gap: 20 }}>
        {/* Display name */}
        <div className="panel">
          <div className="panel-head">
            <h3>Admin display name</h3>
            {nameSavedAt && Date.now() - nameSavedAt < 4000 && <Pill tone="green">Saved</Pill>}
          </div>
          <div style={{ padding: 20 }}>
            <p style={{ color: "var(--mute)", marginBottom: 16, fontSize: 13 }}>
              Used for the personalized greeting on the Dashboard and the avatar in the sidebar
              footer. Leave blank to fall back to a generic greeting.
            </p>
            <div style={{ maxWidth: 360 }}>
              <label htmlFor="admin-name" style={fieldLabel}>
                Display name
              </label>
              <input
                id="admin-name"
                type="text"
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                placeholder="e.g. Bader"
                style={inputStyle}
              />
            </div>
            <div style={{ marginTop: 16 }}>
              <button
                className="btn btn-primary"
                onClick={saveName}
                disabled={!nameDirty || savingName}
              >
                {savingName ? "Saving…" : "Save name"}
              </button>
            </div>
          </div>
        </div>

        {/* Slot caps */}
        <div className="panel">
          <div className="panel-head">
            <h3>Registration slot caps</h3>
            {slotsSavedAt && Date.now() - slotsSavedAt < 4000 && <Pill tone="green">Saved</Pill>}
          </div>
          <div style={{ padding: 20 }}>
            <p style={{ color: "var(--mute)", marginBottom: 16, fontSize: 13 }}>
              Maximum non-rejected registrations per side. Anyone past the cap is auto-waitlisted
              based on registration order.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 480 }}>
              <div>
                <label htmlFor="female-slots" style={fieldLabel}>
                  Sister cap
                </label>
                <input
                  id="female-slots"
                  type="number"
                  min={0}
                  value={femaleSlots}
                  onChange={(e) => setFemaleSlots(e.target.value)}
                  style={inputStyle}
                />
                <div style={{ fontSize: 11, color: "var(--mute)", marginTop: 6 }} className="mono">
                  {data.counts.female} registered
                </div>
              </div>
              <div>
                <label htmlFor="male-slots" style={fieldLabel}>
                  Brother cap
                </label>
                <input
                  id="male-slots"
                  type="number"
                  min={0}
                  value={maleSlots}
                  onChange={(e) => setMaleSlots(e.target.value)}
                  style={inputStyle}
                />
                <div style={{ fontSize: 11, color: "var(--mute)", marginTop: 6 }} className="mono">
                  {data.counts.male} registered
                </div>
              </div>
            </div>
            <div style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "center" }}>
              <button
                className="btn btn-primary"
                onClick={saveSlots}
                disabled={!slotsDirty || savingSlots}
              >
                {savingSlots ? "Saving…" : "Save caps"}
              </button>
              {data.counts.waitlisted > 0 && (
                <span style={{ color: "var(--mute)", fontSize: 12 }}>
                  {data.counts.waitlisted} currently waitlisted
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Payment reconciliation */}
        <div className="panel">
          <div className="panel-head">
            <h3>Payment reconciliation</h3>
          </div>
          <div style={{ padding: 20 }}>
            {sectionHeading("What this does")}
            <p style={{ color: "var(--ink-2)", marginBottom: 16, fontSize: 13, lineHeight: 1.5 }}>
              Checks every Stripe session attached to a registration, fixes mismatched payment
              statuses, and sends any missing confirmation emails. Safe to run repeatedly — it
              only acts on rows that drifted.
            </p>
            <button className="btn" onClick={runFixPayments} disabled={fixingPayments}>
              {fixingPayments ? "Reconciling…" : "Run reconciliation"}
            </button>
            {fixResult && (
              <div
                style={{
                  marginTop: 16,
                  padding: 14,
                  background: fixResult.ok ? "var(--bg-tint)" : "#F7E5E4",
                  border: `1px solid ${fixResult.ok ? "var(--line)" : "#EACAC8"}`,
                  borderRadius: 6,
                  fontSize: 12,
                  color: fixResult.ok ? "var(--ink-2)" : "var(--rose)",
                }}
                className="mono"
              >
                {fixResult.ok
                  ? `Checked ${fixResult.sessionsChecked} sessions · fixed ${fixResult.fixed} · sent ${fixResult.emailsSent} email${fixResult.emailsSent === 1 ? "" : "s"}`
                  : `Error: ${fixResult.error}`}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
