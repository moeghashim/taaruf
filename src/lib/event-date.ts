export function formatEventDate(timestamp: number) {
  return new Date(timestamp).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    timeZoneName: "short",
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
