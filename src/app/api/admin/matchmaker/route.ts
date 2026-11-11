import { deliverMatchmakerPresentation } from "@/lib/matchmaker-delivery";
import { NextRequest } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { getConvexClient } from "@/lib/convex";
import { adminRequestError, getAdminSecret, privateJson } from "@/lib/admin-server";
export async function POST(request: NextRequest) {
  const denied = adminRequestError(request); if (denied) return denied;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !["action", "matchId"].includes(key)) || !["present", "release"].includes(body.action) || typeof body.matchId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(body.matchId)) return privateJson({ error: "Invalid match action." }, 400);
  try {
    const convex = getConvexClient();
    const args = { adminSecret: getAdminSecret(), matchId: body.matchId as Id<"matches"> };
    if (body.action === "release") { await convex.mutation(api.matchmakerMatching.releaseContacts, args); return privateJson({ success: true, message: "Contacts released in both applicant portals." }); }
    const result = await convex.mutation(api.matchmakerMatching.present, args);
    // Only this explicit action invokes the separately gated sender. Permanent
    // recipient claims prevent repeated Present requests from duplicating sends.
    const delivery = await deliverMatchmakerPresentation(convex, args.adminSecret, args.matchId);
    return privateJson({ success: true, ...result, delivery, message: !delivery.enabled ? (result.alreadyPresented ? "Already presented. No duplicate notifications created. Email delivery is not enabled for this workflow." : "Presented in both applicant portals. Email delivery is not enabled for this workflow.") : delivery.failed ? "Presented. Some email deliveries need manual review; no automatic retry will be attempted." : "Presented. Notifications processed without duplicate sends." });
  } catch { return privateJson({ error: "Unable to complete this action. Refresh: both applicants must be eligible and opted in to present; both must approve before contacts are shared." }, 409); }
}
