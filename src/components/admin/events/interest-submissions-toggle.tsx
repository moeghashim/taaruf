"use client";

import { useState } from "react";

export function InterestSubmissionsToggle({ eventId, enabled }: { eventId: string; enabled: boolean }) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/event-interests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, enabled: !enabled }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save interest settings");
      setMessage(result.enabled ? "Interest submissions turned on." : "Interest submissions turned off. Existing interests are unchanged.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save interest settings");
    } finally { setSaving(false); }
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h4 id="interest-toggle-label" style={{ margin: 0 }}>Accept interest submissions</h4>
        <button type="button" role="switch" aria-checked={enabled} aria-labelledby="interest-toggle-label"
          aria-describedby="interest-toggle-help" disabled={saving} onClick={toggle}
          className={enabled ? "btn btn-primary" : "btn"}>
          {saving ? "Saving…" : enabled ? "On" : "Off"}
        </button>
      </div>
      <p id="interest-toggle-help" style={{ fontSize: 13, maxWidth: "70ch", marginTop: 8 }}>
        When on, eligible applicants send interests for this event. It stays on until you turn it off; event dates do not close it automatically. Only one event can be on at a time—turn the current event off before enabling another. Turning it off stops new submissions and preserves existing interests and history.
      </p>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert" style={{ color: "var(--color-destructive)" }}>{error}</p>}
    </div>
  );
}
