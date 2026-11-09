import { getAdminSecret } from "@/lib/admin-server";
import { NextRequest, NextResponse } from "next/server";
import { makeFunctionReference } from "convex/server";
import { getApplicantSessionHash } from "@/lib/applicant-session";
import { getConvexClient } from "@/lib/convex";
import { archiveOriginAllowed, validArchiveBody, archiveError } from "@/lib/archive-request";
export const dynamic = "force-dynamic";
const archiveOwn = makeFunctionReference<"mutation", { adminSecret: string; sessionHash: string; expectedArchivedAt: number | null; confirm: true }>("archive:archiveOwn");
export async function POST(request: NextRequest) {
  try {
    const sessionHash = await getApplicantSessionHash();
    if (!sessionHash) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!archiveOriginAllowed(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    const body = await request.json().catch(() => null);
    if (!validArchiveBody(body)) return NextResponse.json({ error: "Confirm archiving and include the saved revision." }, { status: 400 });
    // Identity comes exclusively from the owner cookie, never a submitted target.
    const result = await getConvexClient().mutation(archiveOwn, { adminSecret: getAdminSecret(), sessionHash, expectedArchivedAt: body.expectedArchivedAt, confirm: true });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return archiveError(error); }
}
