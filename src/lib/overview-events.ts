/** Presentation only: never mutate enrollments, history, or participant workflows. */
export function overviewEvents<T extends { endsAt: number }>(events: readonly T[], now: number): T[] {
  return events.filter(event => Number.isFinite(event.endsAt) && event.endsAt > now);
}
