import type { Doc } from "./_generated/dataModel";

/** Read the registration in the same transaction as any activating write. */
export function assertNotArchived(registration: Pick<Doc<"registrations">, "archivedAt"> | null | undefined): asserts registration is Pick<Doc<"registrations">, "archivedAt"> {
  if (!registration) throw new Error("Profile not found");
  if (registration.archivedAt !== undefined) throw new Error("Participant is archived");
}
