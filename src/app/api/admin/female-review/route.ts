import { createHash, randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";
import { adminRequestError, getAdminSecret, privateJson } from "@/lib/admin-server";
import { getConvexClient } from "@/lib/convex";

export async function POST(request: NextRequest) {
  const denied = adminRequestError(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !["action", "interestId", "deliveryId", "cursor", "view"].includes(key))) return privateJson({ error: "Invalid request." }, 400);
  const validId = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
  try {
    const convex = getConvexClient();
    const adminSecret = getAdminSecret();
    if (body.action === "deliveries") {
      if (body.interestId !== undefined && !validId(body.interestId)) return privateJson({ error: "Invalid interest." }, 400);
      if (body.cursor !== undefined && body.cursor !== null && (typeof body.cursor !== "string" || !body.cursor || body.cursor.length > 8192)) return privateJson({ error: "Invalid delivery cursor. Refresh the list." }, 400);
      if (body.view !== undefined && !["failed", "history"].includes(body.view)) return privateJson({ error: "Invalid delivery view." }, 400);
      return privateJson(await convex.query(api.femaleInterestWorkflow.listDeliveriesPage, { adminSecret, view: body.view ?? "failed", paginationOpts: { numItems: 50, cursor: body.cursor ?? null }, ...(body.interestId ? { interestId: body.interestId as Id<"interests"> } : {}) }));
    }
    if (body.cursor !== undefined || body.view !== undefined) return privateJson({ error: "Invalid action parameters." }, 400);
    if (body.action === "retry") {
      if (!validId(body.deliveryId)) return privateJson({ error: "Invalid delivery." }, 400);
      await convex.mutation(api.femaleInterestWorkflow.retryDelivery, { adminSecret, deliveryId: body.deliveryId as Id<"femaleWorkflowDeliveries"> });
    } else {
      if (!validId(body.interestId)) return privateJson({ error: "Invalid interest." }, 400);
      const args = { adminSecret, interestId: body.interestId as Id<"interests"> };
      if (body.action === "create") {
        const token = randomBytes(32).toString("hex");
        await convex.mutation(api.femaleInterestWorkflow.createReview, { ...args, reviewTokenHash: createHash("sha256").update(token).digest("hex") });
        return privateJson({ success: true, reviewUrl: "/dashboard?femaleReview=" + encodeURIComponent(body.interestId) + "&reviewToken=" + token });
      } else if (body.action === "release") await convex.mutation(api.femaleInterestWorkflow.releaseContacts, args);
      else if (body.action === "revoke") await convex.mutation(api.femaleInterestWorkflow.revokeReview, args);
      else return privateJson({ error: "Invalid action." }, 400);
    }
    return privateJson({ success: true });
  } catch { return privateJson({ error: "Unable to update this review. Refresh and try again." }, 409); }
}
