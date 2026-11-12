import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/** Dedicated, opt-in sender. Never inherits another workflow's production approval. */
export function matchmakerDeliveryConfig() {
  const mode = process.env.MATCHMAKER_EMAIL_MODE;
  if (process.env.MATCHMAKER_EMAIL_ENABLED !== "true") return null;
  const shared = mode === "production" && process.env.MATCHMAKER_EMAIL_TRANSPORT === "transactional";
  const key = shared ? process.env.RESEND_API_KEY : process.env.MATCHMAKER_RESEND_API_KEY;
  const from = shared ? "1Plus1 Match <contact@1plus1match.com>" : process.env.MATCHMAKER_EMAIL_FROM;
  const portal = process.env.MATCHMAKER_PORTAL_URL;
  if (!key || !from || !portal || !["isolated", "production"].includes(mode ?? "")) return null;
  if (mode === "production" && process.env.MATCHMAKER_PRODUCTION_APPROVED !== "true") return null;
  try {
    const url = new URL(portal);
    const live = ["1plus1match.com", "www.1plus1match.com"].includes(url.hostname);
    if (url.protocol !== "https:" || url.username || url.password || (mode === "production" ? !live : live || url.hostname.endsWith(".1plus1match.com"))) return null;
    return {key, from, portal: url.origin + "/me#matchmaker-matching", mode, allowed: (process.env.MATCHMAKER_EMAIL_ALLOWED_RECIPIENTS ?? "").split(",").map(s => s.trim().toLowerCase())};
  } catch { return null; }
}

export async function deliverMatchmakerPresentation(client: ConvexHttpClient, adminSecret: string, matchId: Id<"matches">) {
  const config = matchmakerDeliveryConfig();
  if (!config) return {enabled: false, sent: 0, failed: 0};
  const match = await client.query(api.matches.getById, {adminSecret, id: matchId});
  if (!match || match.matchmakerPresentedAt === undefined) throw new Error("Presentation required");
  let sent = 0, failed = 0;
  for (const recipientId of [match.maleRegistrationId, match.femaleRegistrationId]) {
    // Check allowlist before consuming the permanent claim. Recheck claimed email too.
    const person = await client.query(api.registrations.getById, {adminSecret, id: recipientId});
    if (!person || (config.mode === "isolated" && !config.allowed.includes(person.email.trim().toLowerCase()))) { failed++; continue; }
    const delivery = await client.mutation(api.matchmakerMatching.claimNotification, {adminSecret, matchId, recipientId});
    if (!delivery) continue;
    let success = false;
    let rateLimited = false;
    let retryAfterMs: number | undefined;
    try {
      if (config.mode === "production" || config.allowed.includes(delivery.email.trim().toLowerCase())) {
        const response = await fetch("https://api.resend.com/emails", {method: "POST", headers: {Authorization: "Bearer " + config.key, "Content-Type": "application/json", "Idempotency-Key": delivery.key}, body: JSON.stringify({from: config.from, to: [delivery.email], subject: "A matchmaker match is ready for your review", text: "Assalamu Alaikum,\n\nA matchmaker has presented a potential match for you. Sign in and open Matchmaker Matching to review the profile and decide whether to proceed: " + config.portal + "\n\nContact details are not shared without both applicants' approval and admin release."}), signal: AbortSignal.timeout(15000)});
        success = response.ok; rateLimited = response.status === 429;
        if (rateLimited) {
          const header = response.headers.get("retry-after");
          const delay = header ? (/^\d+$/.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now()) : 60000;
          retryAfterMs = Number.isFinite(delay) ? Math.max(60000, delay) : 60000;
        }
      }
    } catch { /* Ambiguous send: never automatically retry the permanent claim. */ }
    await client.mutation(api.matchmakerMatching.recordNotification, {adminSecret, deliveryId: delivery.deliveryId, sent: success, ...(retryAfterMs === undefined ? {} : {retryAfterMs})});
    if (success) sent++; else failed++;
    if (rateLimited) break; // No tight retry or next-recipient send after provider throttling.
  }
  return {enabled: true, sent, failed};
}
