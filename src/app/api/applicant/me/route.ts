import type { Id } from "../../../../../convex/_generated/dataModel";
import { isApplicantUnauthorized } from "@/lib/applicant-auth-error";
import { getAdminSecret } from "@/lib/admin-server";
import { NextRequest, NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import { getApplicantSessionHash } from "@/lib/applicant-session";
import { getConvexClient } from "@/lib/convex";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const sessionHash = await getApplicantSessionHash();
    if (!sessionHash) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const connectionId = request.nextUrl.searchParams.get("connection");
    if (connectionId !== null && !/^[a-zA-Z0-9_-]{1,128}$/.test(connectionId)) return NextResponse.json({ error: "Invalid connection." }, { status: 400 });
    const convex = getConvexClient();
    const dashboard = await convex.query(api.applicantInterests.getDashboard, { sessionHash, ...(connectionId ? { connectionId: connectionId as Id<"interests"> } : {}) });
    await convex.mutation(api.applicantAuth.touchSession, { adminSecret: getAdminSecret(),  sessionHash });

    return NextResponse.json(dashboard, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Connection unavailable")) return NextResponse.json({ error: "Connection unavailable." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json(
      { error: "Unable to complete request" },
      { status: isApplicantUnauthorized(error) ? 401 : 500 }
    );
  }
}
