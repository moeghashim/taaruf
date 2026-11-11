/** Event dates use Central time, like the public event schedule, not the viewer timezone. */
export function workbenchEventLabel(event: { title: string; startsAt?: number | null }) {
  const date = event.startsAt == null || event.startsAt === 0 ? null : new Date(event.startsAt);
  if (!date || !Number.isFinite(date.getTime())) return `${event.title} — Date unavailable`;
  return `${event.title} — ${date.toLocaleDateString("en-US", {
    timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric",
  })}`;
}
