import { isApplicantUnauthorized } from "@/lib/applicant-auth-error";
import { NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import { getApplicantSessionHash } from "@/lib/applicant-session";
import { getConvexClient } from "@/lib/convex";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

// Read-only polling: never touch/extend the session or expose its cookie/hash.
export async function GET() {
  try {
    const sessionHash = await getApplicantSessionHash();
    if (!sessionHash) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
    const dashboard = await getConvexClient().query(api.applicantInterests.getInterestEligibility, { sessionHash });
    return NextResponse.json({
      canSubmitInterest: dashboard.canSubmitInterest,
      interestSubmissionEventId: dashboard.interestSubmissionEventId,
      interestSubmissionLimit: dashboard.interestSubmissionLimit,
      interestSubmissions: dashboard.interestSubmissions,
    }, { headers });
  } catch (error) {
    const unauthorized = isApplicantUnauthorized(error);
    return NextResponse.json({ error: unauthorized ? "Unauthorized" : "Unable to refresh interest availability." }, { status: unauthorized ? 401 : 503, headers });
  }
}
