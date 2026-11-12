import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
type Retirement = Pick<Doc<"registrations">, "securityRetiredAt" | "mergedIntoRegistrationId">;
/** Merge provenance is never an authentication alias; rollback preserves retirement. */
export function isSecurityRetired(row: Retirement | null | undefined): boolean {
  return !!row && (row.securityRetiredAt !== undefined || row.mergedIntoRegistrationId !== undefined);
}
export function assertNotSecurityRetired(row: Retirement | null | undefined) {
  if (isSecurityRetired(row)) throw new Error("Profile is security retired; contact the team");
}
const emailKey = (value: string) => value.trim().toLowerCase();
const phoneKey = (value: string) => {
  const digits = value.replace(/[^0-9]/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
};
/** Retain source contacts as tombstones. Bounded complete scan fails closed,
 * including legacy noncanonical contacts and non-event signup phone reuse. */
export async function assertContactsNotRetired(ctx: QueryCtx, email: string, phone?: string) {
  const rows = await ctx.db.query("registrations").take(10001);
  if (rows.length > 10000) throw new Error("Account scan limit exceeded; manual review required");
  const e = emailKey(email), p = phoneKey(phone ?? "");
  if (rows.some(row => isSecurityRetired(row) &&
    (emailKey(row.email) === e || (!!row.emailCanonical && emailKey(row.emailCanonical) === e) ||
     (p.length >= 7 && [row.phone, row.phoneCanonical ?? ""].some(value => phoneKey(value) === p))))) {
    throw new Error("Contact belongs to a security retired profile; contact the team");
  }
}
