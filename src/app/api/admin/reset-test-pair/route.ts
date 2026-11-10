import { NextRequest } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import { adminRequestError, getAdminSecret, privateJson } from "@/lib/admin-server";
import { getConvexClient } from "@/lib/convex";

export async function POST(request: NextRequest) {
  const denied = adminRequestError(request);
  if (denied) return denied;
  try {
    const body = await request.json();
    const adminSecret = getAdminSecret();
    if (body?.action === "preview" && Object.keys(body).length === 1) return privateJson(await getConvexClient().query(api.adminPairTestReset.preview, { adminSecret }));
    if (body?.action !== "reset" || Object.keys(body).sort().join(",") !== "action,confirmPair,expectedFingerprint,operationKey,reason" || body.confirmPair !== "219-220" || typeof body.expectedFingerprint !== "string" || typeof body.operationKey !== "string" || typeof body.reason !== "string") return privateJson({ error: "Confirm test pair 219–220 and provide a reason." }, 400);
    return privateJson(await getConvexClient().mutation(api.adminPairTestReset.reset, { adminSecret, confirmPair: body.confirmPair, expectedFingerprint: body.expectedFingerprint, operationKey: body.operationKey, reason: body.reason }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const safe = ["Preview changed; review a fresh preview", "Delivery requires manual reconciliation before reset", "Configured test pair unavailable", "Reset scan limit exceeded; manual review required", "Audit size limit exceeded; manual review required"].find(s => message.includes(s));
    return privateJson({ error: safe ?? "Reset could not complete. Refresh the preview or request manual review." }, 400);
  }
}
