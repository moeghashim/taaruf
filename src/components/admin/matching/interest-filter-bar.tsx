"use client";
import { changeInterestStatus, clickInterestStat, emptyInterestFilters, interestStatLabels, type InterestFilters, type InterestStat } from "@/lib/admin-interest-filters";

type Props = { filters: InterestFilters; onChange: (filters: InterestFilters) => void; counts: Record<InterestStat, number>; events: { id: string; label: string }[]; shown: number };
export function InterestFilterBar({ filters, onChange, counts, events, shown }: Props) {
  const active = (stat: InterestStat) => stat === "total" ? Object.keys(emptyInterestFilters).every(key => filters[key as keyof InterestFilters] === emptyInterestFilters[key as keyof InterestFilters]) : stat === "male" || stat === "female" ? filters.gender === stat : stat === "queued" || stat === "waiting" ? filters.status === "open" && filters.substatus === stat : filters.status === stat;
  return <div className="interest-controls">
    <div className="interest-statistics" role="group" aria-label="Global interest counts">
      {(Object.keys(interestStatLabels) as InterestStat[]).map(stat => <button key={stat} type="button" className={active(stat) ? "interest-stat active" : "interest-stat"} aria-pressed={active(stat)} onClick={() => onChange(clickInterestStat(filters, stat))}>
        <span>{interestStatLabels[stat]}</span><strong>{counts[stat]}</strong>
      </button>)}
    </div>
    <p className="interest-help">Counts cover all events and stay global as you filter. Gender is the submitting applicant.</p>
    <div className="interest-primary-filters">
      <label className="interest-search">Search interests<input type="search" placeholder="Applicant # or name on either side…" value={filters.search} onChange={e => onChange({ ...filters, search: e.target.value })} /></label>
      <label>Status<select value={filters.status} onChange={e => onChange(changeInterestStatus(filters, e.target.value as InterestFilters["status"]))}><option value="all">All</option><option value="open">Open</option><option value="closed">Closed</option></select></label>
      {filters.status === "open" && <label>Open substatus<select value={filters.substatus} onChange={e => onChange({ ...filters, substatus: e.target.value as InterestFilters["substatus"] })}><option value="all">All open</option><option value="queued">Queued</option><option value="waiting">Waiting for Approval</option></select></label>}
      <label>Submitting gender<select value={filters.gender} onChange={e => onChange({ ...filters, gender: e.target.value as InterestFilters["gender"] })}><option value="all">All</option><option value="male">Male</option><option value="female">Female</option></select></label>
      <button type="button" className="btn" onClick={() => onChange({ ...emptyInterestFilters })}>Clear Filters</button>
    </div>
    <div className="interest-secondary-filters">
      <label>Event<select value={filters.event} onChange={e => onChange({ ...filters, event: e.target.value })}><option value="all">All events</option>{events.map(event => <option key={event.id} value={event.id}>{event.label}</option>)}</select></label>
      <label>Visibility<select value={filters.visibility} onChange={e => onChange({ ...filters, visibility: e.target.value as InterestFilters["visibility"] })}><option value="all">All visibility</option><option value="admin_actionable">Admin actionable</option><option value="internal_only">Internal only</option></select></label>
      <label className="interest-checkbox"><input type="checkbox" checked={filters.mutualOnly} onChange={e => onChange({ ...filters, mutualOnly: e.target.checked })} /> Mutual only</label>
      <span className="interest-shown" role="status">{shown} shown of {counts.total}</span>
    </div>
    <details className="interest-definitions"><summary>What do these statuses mean?</summary><p>Queued includes queued and deferred interests. Waiting for Approval means a pending initial bio decision, final applicant approval, or admin contact-release approval. Blocked, paused, unverified, and not-yet-shared interests remain Open but are not counted as waiting. Closed includes ended interests and completed contact sharing. Counts follow the existing canonical interest list; reciprocal audit-only rows are not counted twice.</p></details>
  </div>;
}
