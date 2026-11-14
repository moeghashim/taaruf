/** Homepage promotions only. Existing attendee queries and records are untouched. */
export async function openHomepageEvents<T extends { eventCode: string }>(
  events: readonly T[],
  registrationLookup: (eventCode: string) => Promise<unknown | null>,
): Promise<T[]> {
  // The existing public registration lookup enforces opening/closing deadlines.
  const visible = await Promise.all(events.map(async event =>
    (await registrationLookup(event.eventCode)) !== null,
  ));
  return events.filter((_, index) => visible[index]);
}
