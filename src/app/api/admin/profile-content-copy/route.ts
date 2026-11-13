import { NextRequest } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { adminRequestError, getAdminSecret, privateJson } from "@/lib/admin-server";
import { getConvexClient } from "@/lib/convex";

export const dynamic = "force-dynamic";
/** No user credentials, arbitrary fields, storage IDs or URLs are accepted. */
export async function POST(request: NextRequest) {
  const denied = adminRequestError(request);
  if (denied) return denied;
  try {
    const text = await request.text();
    if (text.length > 4096) return privateJson({ error: "Invalid copy request" }, 400);
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) return privateJson({ error: "Invalid copy request" }, 400);
    const operation = body.operation;
    const keys = operation === "preview" ? ["operation", "sourceId", "targetId", "sourceNumber", "targetNumber"]
      : operation === "apply" ? ["operation", "sourceId", "targetId", "sourceNumber", "targetNumber", "operationKey", "expectedFingerprint"]
      : operation === "status" ? ["operation", "operationKey"]
      : operation === "rollback" ? ["operation", "auditId"] : [];
    if (!keys.length || Object.keys(body).sort().join() !== keys.sort().join()) return privateJson({ error: "Invalid copy request" }, 400);
    const client = getConvexClient();
    const adminSecret = getAdminSecret();
    if (operation === "status") {
      if (typeof body.operationKey !== "string" || !/^[a-zA-Z0-9_-]{10,100}$/.test(body.operationKey)) return privateJson({ error: "Invalid operation key" }, 400);
      return privateJson(await client.query(api.profileContentCopy.status, { adminSecret, operationKey: body.operationKey }));
    }
    if (operation === "rollback") {
      if (typeof body.auditId !== "string" || !/^[a-zA-Z0-9]{10,100}$/.test(body.auditId)) return privateJson({ error: "Invalid audit ID" }, 400);
      return privateJson(await client.mutation(api.profileContentCopy.rollback, { adminSecret, auditId: body.auditId as Id<"profileContentCopyAudits"> }));
    }
    if (![body.sourceId, body.targetId].every(x => typeof x === "string" && /^[a-zA-Z0-9]{10,100}$/.test(x)) || body.sourceId === body.targetId || ![body.sourceNumber, body.targetNumber].every(x => Number.isSafeInteger(x) && x > 0)) return privateJson({ error: "Invalid profile selection" }, 400);
    const pair = { adminSecret, sourceId: body.sourceId as Id<"registrations">, targetId: body.targetId as Id<"registrations">, sourceNumber: body.sourceNumber as number, targetNumber: body.targetNumber as number };
    if (operation === "preview") return privateJson(await client.query(api.profileContentCopy.preview, pair));
    if (typeof body.operationKey !== "string" || !/^[a-zA-Z0-9_-]{10,100}$/.test(body.operationKey) || typeof body.expectedFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(body.expectedFingerprint)) return privateJson({ error: "Preview fingerprint and operation key required" }, 400);
    return privateJson(await client.action(api.profileContentCopy.apply, { ...pair, operationKey: body.operationKey, expectedFingerprint: body.expectedFingerprint }));
  } catch {
    // Convex validator errors may contain secret arguments. Never reflect them.
    return privateJson({ error: "Copy was not confirmed. Refresh the dry run; inspect the operation receipt before retrying." }, 409);
  }
}
