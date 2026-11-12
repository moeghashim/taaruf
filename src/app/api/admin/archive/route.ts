import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { makeFunctionReference } from "convex/server";
import { getConvexClient } from "@/lib/convex";
import { archiveOriginAllowed, validArchiveBody, archiveError } from "@/lib/archive-request";
export const dynamic = "force-dynamic";
const archiveAdmin = makeFunctionReference<"mutation", { adminSecret: string; registrationId: string; expectedArchivedAt: number | null; expectedRestoredArchivedAt?: number; confirm: true }>("archive:archiveAdmin");
export async function POST(request: NextRequest) {
  const password = process.env.ADMIN_PASSWORD;
  const token = request.cookies.get("admin_token")?.value;
  const expected = password ? crypto.createHash("sha256").update(password + (process.env.ADMIN_TOKEN_SALT || "taaruf-admin-salt")).digest("hex") : "";
  if (!token || !expected || !/^[a-f0-9]{64}$/.test(token) || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!archiveOriginAllowed(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const body = await request.json().catch(() => null);
    const registrationId = body?.registrationId;
    if (!validArchiveBody(body) || typeof registrationId !== "string" || !registrationId.trim() || registrationId.length > 200) return NextResponse.json({ error: "Select a profile and confirm archiving with its saved revision." }, { status: 400 });
    const bridgeSecret = process.env.ATTENDANCE_ADMIN_SECRET;
    if (!bridgeSecret) return NextResponse.json({ error: "Archive service is not configured." }, { status: 503 });
    const result = await getConvexClient().mutation(archiveAdmin, { adminSecret: bridgeSecret, registrationId, expectedArchivedAt: body.expectedArchivedAt, ...(body.expectedRestoredArchivedAt !== undefined ? {expectedRestoredArchivedAt: body.expectedRestoredArchivedAt} : {}), confirm: true });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return archiveError(error); }
}
