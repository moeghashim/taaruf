import type { Doc } from "../../convex/_generated/dataModel";

type Person = Pick<Doc<"registrations">, "name" | "gender" | "publicApplicantNumber">;
export type FilterableInterest = Pick<Doc<"interests">, "status" | "testReset" | "adminRemovedAt" | "adminStatus" | "femaleWorkflow" | "eventId" | "visibility" | "source" | "notes"> & {
  fromRegistration?: Person | null; toRegistration?: Person | null;
  workbenchReview?: { label: string } | null;
  match?: Pick<Doc<"matches">, "status" | "testResetAt" | "contactGate" | "adminReleasedAt"> | null;
  event?: { title: string; eventCode?: string; eventMonth?: string } | null;
  mutual?: unknown;
};
export type InterestFilters = {
  status: "all" | "open" | "closed";
  substatus: "all" | "queued" | "waiting";
  gender: "all" | "male" | "female";
  search: string; event: string; visibility: "all" | "internal_only" | "admin_actionable"; mutualOnly: boolean;
};
export const emptyInterestFilters: InterestFilters = { status: "all", substatus: "all", gender: "all", search: "", event: "all", visibility: "all", mutualOnly: false };
export type InterestStat = "total" | "open" | "queued" | "waiting" | "closed" | "male" | "female";
export const interestStatLabels: Record<InterestStat, string> = { total: "Total", open: "Open", queued: "Queued", waiting: "Waiting for Approval", closed: "Closed", male: "Male", female: "Female" };
/** Presentation only. Canonical review takes precedence over stale raw queue flags.
 * Waiting means an explicit pending initial/final decision or admin contact approval;
 * blocked, paused and ambiguous rows stay Open, not falsely waiting for approval. */
export function adminInterestStage(row: FilterableInterest): "closed" | "queued" | "waiting" | "other" {
  const label = row.workbenchReview?.label ?? "";
  if (label) {
    if (/^(Closed|Contacts released)/.test(label)) return "closed";
    if (/^(Queued|Deferred) — /.test(label)) return "queued";
    if (/^Waiting on .+ — (Initial bio decision|Final approval)/.test(label) || label === "Admin action — Review and release contacts (both final approvals saved)") return "waiting";
    return "other";
  }
  if (row.testReset || row.adminRemovedAt !== undefined || ["closed", "declined", "withdrawn"].includes(row.status) || row.adminStatus === "declined" || ["declined", "revoked"].includes(row.femaleWorkflow?.state ?? "")) return "closed";
  if (row.match?.testResetAt !== undefined || ["closed", "declined"].includes(row.match?.status ?? "")) return "closed";
  if (row.match?.status === "paused") return "other";
  if (row.match?.contactGate === "contacts_released" || row.match?.status === "contact_shared" || row.match?.adminReleasedAt !== undefined || row.femaleWorkflow?.state === "contacts_released") return "closed";
  if (["queued", "deferred"].includes(row.status)) return "queued";
  return "other";
}
export function interestCounts(rows: FilterableInterest[]): Record<InterestStat, number> {
  const counts = { total: rows.length, open: 0, queued: 0, waiting: 0, closed: 0, male: 0, female: 0 };
  for (const row of rows) {
    const stage = adminInterestStage(row);
    if (stage === "closed") counts.closed++; else counts.open++;
    if (stage === "queued" || stage === "waiting") counts[stage]++;
    const gender = row.fromRegistration?.gender;
    if (gender === "male" || gender === "female") counts[gender]++;
  }
  return counts;
}
export function changeInterestStatus(filters: InterestFilters, status: InterestFilters["status"]): InterestFilters {
  return { ...filters, status, substatus: "all" };
}
export function clickInterestStat(filters: InterestFilters, stat: InterestStat): InterestFilters {
  if (stat === "total") return { ...emptyInterestFilters };
  if (stat === "male" || stat === "female") return { ...filters, gender: stat };
  if (stat === "queued" || stat === "waiting") return { ...filters, status: "open", substatus: stat };
  return changeInterestStatus(filters, stat);
}
export function matchesInterestFilters(row: FilterableInterest, filters: InterestFilters): boolean {
  const stage = adminInterestStage(row);
  if (filters.status === "closed" && stage !== "closed" || filters.status === "open" && stage === "closed") return false;
  if (filters.status === "open" && filters.substatus !== "all" && stage !== filters.substatus) return false;
  if (filters.gender !== "all" && row.fromRegistration?.gender !== filters.gender) return false;
  if (filters.event !== "all" && row.eventId !== filters.event || filters.visibility !== "all" && row.visibility !== filters.visibility || filters.mutualOnly && !row.mutual) return false;
  const q = filters.search.trim().toLowerCase();
  if (!q) return true;
  const numberQuery = q.replace(/^(?:applicant\s*)?#\s*|^applicant\s+/i, "");
  if (/^\d+$/.test(numberQuery) && [row.fromRegistration, row.toRegistration].some(p => p?.publicApplicantNumber !== undefined && String(p.publicApplicantNumber) === numberQuery)) return true;
  return [row.fromRegistration?.name, row.toRegistration?.name, row.notes, row.source, row.event?.title, row.event?.eventCode, row.event?.eventMonth].some(value => value?.toLowerCase().includes(q));
}
