import { isApplicantUnauthorized } from "@/lib/applicant-auth-error";
import { getAdminSecret } from "@/lib/admin-server";
import { NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import { getApplicantSessionHash } from "@/lib/applicant-session";
import { getConvexClient } from "@/lib/convex";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sessionHash = await getApplicantSessionHash();
    if (!sessionHash) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const convex = getConvexClient();
    const dashboard = await convex.query(api.applicantInterests.getDashboard, { sessionHash });
    await convex.mutation(api.applicantAuth.touchSession, { adminSecret: getAdminSecret(),  sessionHash });

    const reviews = await convex.query(api.femaleInterestWorkflow.getDashboard, { sessionHash });
    const states = new Map(reviews.map(review => [review.interestId, review.state]));
    const annotate = <T extends { interestId: string }>(rows: T[]) => rows.map(row => ({ ...row, ...(states.has(row.interestId as typeof reviews[number]["interestId"]) ? { femaleWorkflow: { state: states.get(row.interestId as typeof reviews[number]["interestId"]) } } : {}) }));
    return NextResponse.json({ ...dashboard, inbound: annotate(dashboard.inbound), outbound: annotate(dashboard.outbound), privateDocumented: annotate(dashboard.privateDocumented) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: "Unable to complete request" },
      { status: isApplicantUnauthorized(error) ? 401 : 500 }
    );
  }
}
