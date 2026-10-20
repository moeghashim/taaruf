import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { getConvexClient } from "@/lib/convex";
function authorized(request: NextRequest) {
  if (!process.env.ADMIN_PASSWORD) return false;
  const expected = crypto.createHash("sha256").update(process.env.ADMIN_PASSWORD + (process.env.ADMIN_TOKEN_SALT || "taaruf-admin-salt")).digest("hex");
  return request.cookies.get("admin_token")?.value === expected;
}
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.ATTENDANCE_ADMIN_SECRET) return NextResponse.json({ error: "Attendance service not configured" }, { status: 503 });
  try {
    return NextResponse.json(await getConvexClient().query(api.eventAttendees.list, {
      adminSecret: process.env.ATTENDANCE_ADMIN_SECRET,
      eventId: request.nextUrl.searchParams.get("eventId") as Id<"events"> || undefined,
      search: request.nextUrl.searchParams.get("search") || undefined,
    }));
  } catch { return NextResponse.json({ error: "Unable to load attendance" }, { status: 400 }); }
}
export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ error: "Event Attendees is retired; use Events approval and check-in" }, { status: 410 });
}
