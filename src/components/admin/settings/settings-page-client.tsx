"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { PageHead } from "@/components/admin/layout/page-head";
import { Pill } from "@/components/admin/primitives/status-pill";
import { api } from "../../../../convex/_generated/api";

type FixResult =
  | { ok: true; sessionsChecked: number; fixed: number; emailsSent: number }
  | { ok: false; error: string };

/**
 * Settings surface — payment reconciliation and admin display name editor. All actions hit
 * Convex mutations or the existing /api/admin/fix-payments route.
 */
export function SettingsPageClient() {
  const adminNameValue = useQuery(api.settings.get, { key: "admin_name" });
  const setSetting = useMutation(api.settings.set);

  // Admin name
  const [adminName, setAdminName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameSavedAt, setNameSavedAt] = useState<number | null>(null);

  // Fix payments
  const [fixingPayments, setFixingPayments] = useState(false);
  const [fixResult, setFixResult] = useState<FixResult | null>(null);

  useEffect(() => {
    if (typeof adminNameValue === "string") {
      setAdminName(adminNameValue);
    } else if (adminNameValue === null) {
      setAdminName("");
    }
  }, [adminNameValue]);

  const nameDirty = adminName.trim() !== (typeof adminNameValue === "string" ? adminNameValue : "");

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
        subtitle="Payment reconciliation and admin display name."
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
