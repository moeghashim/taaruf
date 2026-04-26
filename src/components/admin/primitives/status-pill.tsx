import type { ReactNode } from "react";

export type Tone = "plain" | "green" | "amber" | "rose" | "blue" | "gold";

type PillProps = {
  tone?: Tone;
  children: ReactNode;
};

/**
 * Generic pill chip. The `pill` base class + tone class come from the
 * admin theme block in globals.css.
 */
export function Pill({ tone = "plain", children }: PillProps) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

const STATUS_MAP: Record<string, { tone: Tone; label: string }> = {
  approved: { tone: "green", label: "Approved" },
  pending: { tone: "amber", label: "Pending" },
  rejected: { tone: "rose", label: "Rejected" },
  waitlisted: { tone: "gold", label: "Waitlisted" },
  paid: { tone: "green", label: "Paid" },
  failed: { tone: "rose", label: "Failed" },
  // Match / interest statuses (used by the prototype; safe defaults
  // until those surfaces have real data).
  new: { tone: "plain", label: "New" },
  reviewing: { tone: "amber", label: "Reviewing" },
  contact_shared: { tone: "green", label: "Contact shared" },
  declined: { tone: "rose", label: "Declined" },
  paused: { tone: "plain", label: "Paused" },
  closed: { tone: "plain", label: "Closed" },
  active: { tone: "green", label: "Active" },
  queued: { tone: "blue", label: "Queued" },
  converted_to_match: { tone: "green", label: "Converted" },
};

export function StatusPill({ status }: { status: string }) {
  const entry = STATUS_MAP[status] ?? { tone: "plain" as Tone, label: status };
  return <Pill tone={entry.tone}>{entry.label}</Pill>;
}
