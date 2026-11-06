import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { ConvexError } from "convex/values";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { getConvexClient } from "@/lib/convex";

export async function POST(request: NextRequest) {
  const password = process.env.ADMIN_PASSWORD;
  const token = request.cookies.get("admin_token")?.value;
  const expected = password ? crypto.createHash("sha256").update(password + (process.env.ADMIN_TOKEN_SALT || "taaruf-admin-salt")).digest("hex") : "";
  if (!token || !/^[a-f0-9]{64}$/.test(token) || !expected || token.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) return NextResponse.json({ error: "Your admin session has expired. Sign in again." }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      // Next normalizes loopback/proxy URLs; Host retains the browser-facing authority.
      const parsed = new URL(origin);
      if (!["http:", "https:"].includes(parsed.protocol) || parsed.host !== (request.headers.get("host") || request.nextUrl.host)) throw new Error("Origin mismatch");
    } catch { return NextResponse.json({ error: "Invalid request origin." }, { status: 403 }); }
  }
  const adminSecret = process.env.ATTENDANCE_ADMIN_SECRET;
  if (!adminSecret) return NextResponse.json({ error: "Event service is not configured. Contact support." }, { status: 503 });
  try {
    const body = await request.json();
    if (!body || typeof body.eventId !== "string" || !body.eventId || typeof body.enabled !== "boolean") return NextResponse.json({ error: "An event and ON/OFF selection are required." }, { status: 400 });
    const eventId = await getConvexClient().mutation(api.events.setInterestSubmissionsEnabled, {
      adminSecret, eventId: body.eventId as Id<"events">, enabled: body.enabled,
      // Shared-password authentication cannot identify an individual administrator.
      actor: "shared admin",
    });
    return NextResponse.json({ eventId });
  } catch (error) {
    const message = error instanceof ConvexError && typeof error.data === "string" ? error.data : "Unable to change interest submissions. Refresh and try again.";
    return NextResponse.json({ error: message }, { status: error instanceof ConvexError ? 409 : 400 });
  }
}
