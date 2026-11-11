import { NextRequest } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { getApplicantSessionHash } from "@/lib/applicant-session";
import { getConvexClient } from "@/lib/convex";
import { privateJson } from "@/lib/admin-server";
export const dynamic = "force-dynamic";
function failure(error: unknown) {
  return privateJson({ error: error instanceof Error && /Unauthorized/.test(error.message) ? "Please sign in again." : "This match has changed or is unavailable. Refresh and try again." }, error instanceof Error && /Unauthorized/.test(error.message) ? 401 : 409);
}
export async function GET() {
  const sessionHash = await getApplicantSessionHash();
  if (!sessionHash) return privateJson({ error: "Please sign in again." }, 401);
  try { return privateJson(await getConvexClient().query(api.matchmakerMatching.getMine, { sessionHash })); }
  catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  const sessionHash = await getApplicantSessionHash();
  if (!sessionHash) return privateJson({ error: "Please sign in again." }, 401);
  try { const origin = new URL(request.headers.get("origin") || ""); if (!["http:", "https:"].includes(origin.protocol) || origin.protocol !== request.nextUrl.protocol || origin.host !== (request.headers.get("host") || request.nextUrl.host)) throw new Error(); }
  catch { return privateJson({ error: "Invalid request origin." }, 403); }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return privateJson({ error: "Invalid request." }, 400);
  const allowed = body.action === "consent" ? ["action", "optedIn"] : body.action === "followup" ? ["action", "matchId", "status"] : ["action", "matchId"];
  if (Object.keys(body).some(key => !allowed.includes(key))) return privateJson({ error: "Invalid request." }, 400);
  try {
    const convex = getConvexClient();
    if (body.action === "consent") {
      if (typeof body.optedIn !== "boolean") return privateJson({ error: "Choose whether to opt in." }, 400);
      await convex.mutation(api.matchmakerMatching.setConsent, { sessionHash, optedIn: body.optedIn });
    } else {
      if (typeof body.matchId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(body.matchId)) return privateJson({ error: "Invalid match." }, 400);
      const args = { sessionHash, matchId: body.matchId as Id<"matches"> };
      if (body.action === "approve") await convex.mutation(api.matchmakerMatching.approve, args);
      else if (body.action === "withdraw") await convex.mutation(api.matchmakerMatching.withdraw, args);
      else if (body.action === "followup" && ["contact_made", "getting_to_know", "not_proceeding", "engaged"].includes(body.status)) await convex.mutation(api.matchmakerMatching.followup, { ...args, status: body.status });
      else return privateJson({ error: "Invalid action." }, 400);
    }
    return privateJson({ success: true });
  } catch (error) { return failure(error); }
}
