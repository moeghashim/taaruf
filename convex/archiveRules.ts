import { assertNotSecurityRetired } from "./registrationSecurity";
import type { Doc } from "./_generated/dataModel";

/** Read the registration in the same transaction as any activating write. */
export function assertNotArchived(registration: Pick<Doc<"registrations">, "archivedAt" | "securityRetiredAt" | "mergedIntoRegistrationId"> | null | undefined): asserts registration is Pick<Doc<"registrations">, "archivedAt" | "securityRetiredAt" | "mergedIntoRegistrationId"> {
  if (!registration) throw new Error("Profile not found");
  assertNotSecurityRetired(registration);
  if (registration.archivedAt !== undefined) throw new Error("Participant is archived");
}
