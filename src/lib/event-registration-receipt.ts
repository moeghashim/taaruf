import type { ConvexHttpClient } from "convex/browser";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { createToken, hashToken } from "./applicant-session";
import { sendConfirmationEmail, sendEventRegistrationReceivedEmail } from "./email";

export async function sendEventReceipt(convex: ConvexHttpClient, eventRegistrationId: Id<"eventRegistrations">, receiptAttempt?: number) {
  const adminSecret = process.env.ATTENDANCE_ADMIN_SECRET;
  if (!adminSecret) throw new Error("Receipt server authorization not configured");
  const token = crypto.randomUUID();
  const claim = await convex.mutation(api.events.claimRegistrationReceivedEmail, { eventRegistrationId, adminSecret, token, receiptAttempt });
  if (!claim.claimed) return { sent: false, ...(claim.error ? { error: claim.error } : {}) };
  if (!claim.name || !claim.email || !claim.eventTitle || !claim.registrationStatus || !claim.key) throw new Error("Incomplete event receipt claim");
  const result = await sendEventRegistrationReceivedEmail({ name: claim.name, email: claim.email, eventTitle: claim.eventTitle, registrationStatus: claim.registrationStatus, eventRegistrationId, idempotencyKey: claim.key });
  await convex.mutation(api.events.recordRegistrationReceivedEmailFailure, {
    eventRegistrationId, adminSecret, token, key: claim.key,
    error: result.success ? undefined : result.error || "Receipt delivery failed",
  });
  return { sent: result.success, error: result.error };
}

/** Immutable checkout association, never profile's latest event or unverified metadata. */
export async function sendCheckoutEventReceipt(convex: ConvexHttpClient, stripeSessionId: string) {
  const link = await convex.query(api.registrations.resolveCheckoutReceipt, { stripeSessionId, adminSecret: process.env.ATTENDANCE_ADMIN_SECRET || "" });
  if (!link) return { sent: false, error: "Historical checkout has no safe receipt association; manual reconciliation required" };
  if (!link.eventRegistrationId) return { sent: false, nonEvent: true, registrationId: link.registrationId };
  return await sendEventReceipt(convex, link.eventRegistrationId, link.receiptAttempt ?? 0);
}

export async function sendCheckoutReceipt(convex: ConvexHttpClient, stripeSessionId: string, appUrl: string) {
  const receipt = await sendCheckoutEventReceipt(convex, stripeSessionId);
  if (!("nonEvent" in receipt)) return receipt;
  const adminSecret = process.env.ATTENDANCE_ADMIN_SECRET || "";
  const token = crypto.randomUUID();
  const loginToken = createToken();
  const claim = await convex.mutation(api.registrations.claimWelcomeReceipt, { stripeSessionId, adminSecret, token, tokenHash: hashToken(loginToken), profileUrl: appUrl + "/api/applicant/login/verify?token=" + encodeURIComponent(loginToken) });
  if (!claim.claimed) return { sent: false, error: claim.error };
  if (!claim.name || !claim.email || !claim.profileUrl || !claim.key) throw new Error("Incomplete welcome claim");
  const result = await sendConfirmationEmail({ name: claim.name, email: claim.email, profileUrl: claim.profileUrl, idempotencyKey: claim.key });
  await convex.mutation(api.registrations.finishWelcomeReceipt, { stripeSessionId, adminSecret, token, error: result.success ? undefined : result.error || "Welcome delivery failed" });
  return { sent: result.success, error: result.error };
}
