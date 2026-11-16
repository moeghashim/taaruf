import type { Doc } from "../../convex/_generated/dataModel";

type Person = Pick<Doc<"registrations">, "name" | "publicApplicantNumber">;
type Interest = { fromRegistration?: Person | null; toRegistration?: Person | null; workbenchReview?: { label: string } | null };
const person = (p?: Person | null) => `#${p?.publicApplicantNumber ?? "?"} ${p?.name?.trim() || "Name unavailable"}`;

/** Presentation only: consume the canonical, provenance-checked admin projection. */
export function conciseWorkbenchStatus(label?: string): string {
  if (!label) return "Status unavailable | Admin check: refresh review details";
  const queued = /^(Queued|Deferred) — /.exec(label)?.[1];
  const prefix = queued ? queued + " · " : "";
  if (/^Closed/.test(label)) return "Closed | No action";
  if (/^Paused/.test(label)) return "Paused | Admin action: review paused match";
  if (/^Contacts released/.test(label)) return "Contacts released | No action";
  if (label === "Admin action — Review and release contacts (both final approvals saved)") return "Both finals approved | Admin action: review and release contacts";
  if (label.includes("has another active match")) return prefix + "Blocked by active match | Admin action: review active match" + (label.includes("Legacy final approval lacks explicit provenance") ? "; verify approval history" : label.includes("stale or unverified active-match pointer") ? "; verify match record" : "");
  if (label.includes("Legacy final approval lacks explicit provenance")) return prefix + "Final approval unverified | Admin check: verify approval history";
  if (label.includes("stale or unverified active-match pointer")) return prefix + "Availability unverified | Admin check: verify match record";
  if (label.includes("is not approved")) return prefix + "Profile not approved | Admin action: review profile";
  if (label.startsWith("Admin check")) return "Review needed | " + label.replace("Admin check — ", "Admin check: ");
  if (label.includes("Queue/defer blocker not recorded")) return prefix + "Review needed | Admin check: verify queue status";
  const share = /^Admin action — Share (brother|sister) #(\d+)’s profile for review$/.exec(label);
  if (share) return `Initial bio review | Admin action: share ${share[1]} #${share[2]}’s profile`;
  const waiting = /Waiting on (brother|sister|both)\b/.exec(label)?.[1];
  if (waiting && label.includes("Initial bio decision")) return prefix + "Initial bio review | Waiting on " + waiting;
  if (waiting && label.includes("Final approval")) return prefix + "Final approval | Waiting on " + waiting;
  return prefix + "Review needed | Admin check: verify workflow";
}

export function workbenchInterestLabel(interest: Interest): string {
  return `${person(interest.fromRegistration)} → ${person(interest.toRegistration)} | ${conciseWorkbenchStatus(interest.workbenchReview?.label)}`;
}
