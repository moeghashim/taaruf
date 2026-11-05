import { NextRequest, NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import { getApplicantSessionHash } from "@/lib/applicant-session";
import { getConvexClient } from "@/lib/convex";
import { isMatchmakingPreference } from "@/lib/matchmaking-preference";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const sessionHash = await getApplicantSessionHash();
    if (!sessionHash) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json().catch(() => null);
    if (!body || !isMatchmakingPreference(body.matchmakingPreference) ||
      !(body.expectedUpdatedAt === null || (typeof body.expectedUpdatedAt === "number" && Number.isFinite(body.expectedUpdatedAt) && body.expectedUpdatedAt >= 0))) {
      return NextResponse.json({ error: "A valid matchmaking preference and saved revision are required." }, { status: 400 });
    }
    const result = await getConvexClient().mutation(api.applicantProfile.updateMatchmakingPreference, {
      sessionHash, matchmakingPreference: body.matchmakingPreference, expectedUpdatedAt: body.expectedUpdatedAt,
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/matchmaking preference changed/i.test(message)) {
      return NextResponse.json({ error: "Your preference changed. Reload it before saving again.", code: "preference_conflict" }, { status: 409 });
    }
    if (/Unauthorized/.test(message)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Your preference could not be saved. Please try again." }, { status: 500 });
  }
}
