import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";
import { getApplicantSessionHash } from "@/lib/applicant-session";
import { getConvexClient } from "@/lib/convex";
import { privateJson } from "@/lib/admin-server";

export const dynamic = "force-dynamic";
const validId = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const validToken = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
function failure(error: unknown) {
  const unauthorized = error instanceof Error && /Unauthorized/.test(error.message);
  return privateJson({ error: unauthorized ? "Please sign in to your applicant account." : "This review is unavailable or has changed. Return to your portal and refresh." }, unauthorized ? 401 : 409);
}
export async function GET(request: NextRequest) {
  const sessionHash = await getApplicantSessionHash();
  if (!sessionHash) return privateJson({ error: "Please sign in to your applicant account." }, 401);
  try {
    const interestId = request.nextUrl.searchParams.get("interestId");
    const token = request.nextUrl.searchParams.get("reviewToken");
    const convex = getConvexClient();
    if (!interestId && !token) {
      const cursor = request.nextUrl.searchParams.get("cursor");
      if (cursor !== null && (!cursor || cursor.length > 8192)) return privateJson({ error: "Invalid review cursor. Refresh your portal." }, 400);
      return privateJson(await convex.query(api.femaleInterestWorkflow.getDashboardPage, { sessionHash, paginationOpts: { numItems: 50, cursor } }));
    }
    if (!validId(interestId) || (token !== null && !validToken(token))) return privateJson({ error: "Invalid review link." }, 400);
    return privateJson(await convex.query(api.femaleInterestWorkflow.getReviewAccess, { sessionHash, interestId: interestId as Id<"interests">, ...(token ? { reviewTokenHash: createHash("sha256").update(token).digest("hex") } : {}) }));
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  const sessionHash = await getApplicantSessionHash();
  if (!sessionHash) return privateJson({ error: "Please sign in to your applicant account." }, 401);
  try {
    const origin = new URL(request.headers.get("origin") || "");
    if (!["http:", "https:"].includes(origin.protocol) || origin.protocol !== request.nextUrl.protocol || origin.host !== (request.headers.get("host") || request.nextUrl.host)) throw new Error("Origin mismatch");
  } catch { return privateJson({ error: "Invalid request origin." }, 403); }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) || !validId(body.interestId)) return privateJson({ error: "Invalid request." }, 400);
  try {
    const convex = getConvexClient();
    if (body.action === "respond") {
      if (Object.keys(body).some(key => !["action", "interestId", "decision", "reviewToken"].includes(key)) || !["accept", "decline"].includes(body.decision) || (body.reviewToken !== undefined && !validToken(body.reviewToken))) return privateJson({ error: "Choose accept or decline." }, 400);
      await convex.mutation(api.femaleInterestWorkflow.respond, { sessionHash, interestId: body.interestId as Id<"interests">, decision: body.decision, ...(body.reviewToken ? { reviewTokenHash: createHash("sha256").update(body.reviewToken).digest("hex") } : {}) });
    } else if (body.action === "brother_final") {
      if (Object.keys(body).some(key => !["action", "interestId", "approved", "reviewToken"].includes(key)) || typeof body.approved !== "boolean" || (body.reviewToken !== undefined && !validToken(body.reviewToken))) return privateJson({ error: "An explicit approval or decline is required." }, 400);
      await convex.mutation(api.femaleInterestWorkflow.brotherFinal, { sessionHash, interestId: body.interestId as Id<"interests">, approved: body.approved, ...(body.reviewToken ? { reviewTokenHash: createHash("sha256").update(body.reviewToken).digest("hex") } : {}) });
    } else if (body.action === "confirm") {
      if (Object.keys(body).some(key => !["action", "interestId", "confirmed"].includes(key)) || typeof body.confirmed !== "boolean") return privateJson({ error: "An explicit confirmation is required." }, 400);
      await convex.mutation(api.femaleInterestWorkflow.confirm, { sessionHash, interestId: body.interestId as Id<"interests">, confirmed: body.confirmed });
    } else return privateJson({ error: "Invalid action." }, 400);
    return privateJson({ success: true });
  } catch (error) { return failure(error); }
}
