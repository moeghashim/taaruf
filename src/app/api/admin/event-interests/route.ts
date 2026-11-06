import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { getConvexClient } from "../../../../lib/convex";

export async function POST(request: NextRequest) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const expected = crypto.createHash("sha256").update(password + (process.env.ADMIN_TOKEN_SALT || "taaruf-admin-salt")).digest("hex");
  if (request.cookies.get("admin_token")?.value !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.ATTENDANCE_ADMIN_SECRET) {
    return NextResponse.json({ error: "Interest settings service not configured" }, { status: 503 });
  }
  try {
    const body = await request.json();
    if (typeof body.eventId !== "string" || !body.eventId || typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "Choose an event and an on/off value" }, { status: 400 });
    }
    const result = await getConvexClient().mutation(api.events.setInterestSubmissionsEnabled, {
      adminSecret: process.env.ATTENDANCE_ADMIN_SECRET,
      eventId: body.eventId as Id<"events">,
      enabled: body.enabled,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const conflict = message.match(/Turn off interest submissions for .* before enabling this event\./)?.[0];
    if (conflict) return NextResponse.json({ error: conflict }, { status: 409 });
    for (const safe of ["Interest submissions require a scheduled or completed event", "Event not found", "Only matching events can accept applicant interests"]) {
      if (message.includes(safe)) return NextResponse.json({ error: safe }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to save interest settings. Please try again." }, { status: 400 });
  }
}
