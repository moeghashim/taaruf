import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { getConvexClient } from "../../../../lib/convex";
function authorized(request: NextRequest) {
  if (!process.env.ADMIN_PASSWORD) return false;
  const expected = crypto.createHash("sha256").update(process.env.ADMIN_PASSWORD + (process.env.ADMIN_TOKEN_SALT || "taaruf-admin-salt")).digest("hex");
  return request.cookies.get("admin_token")?.value === expected;
}
export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.ATTENDANCE_ADMIN_SECRET) return NextResponse.json({ error: "Attendance service not configured" }, { status: 503 });
  try {
    const body = await request.json();
    if (!["not_checked_in", "attended", "no_show"].includes(body.attendanceStatus) || typeof body.eventRegistrationId !== "string") throw new Error("Invalid attendance");
    await getConvexClient().mutation(api.events.updateAttendanceStatus, {
      adminSecret: process.env.ATTENDANCE_ADMIN_SECRET,
      eventRegistrationId: body.eventRegistrationId as Id<"eventRegistrations">,
      attendanceStatus: body.attendanceStatus,
    });
    return NextResponse.json({ success: true });
  } catch { return NextResponse.json({ error: "Unable to update attendance" }, { status: 400 }); }
}
