import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { getConvexClient } from "../../../../lib/convex";

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
      if (!["http:", "https:"].includes(parsed.protocol) || parsed.protocol !== request.nextUrl.protocol || parsed.host !== (request.headers.get("host") || request.nextUrl.host)) throw new Error("Origin mismatch");
    } catch { return NextResponse.json({ error: "Invalid request origin." }, { status: 403 }); }
  }
  if (!process.env.ATTENDANCE_ADMIN_SECRET) {
    return NextResponse.json({ error: "Interest settings service not configured" }, { status: 503 });
  }
  if (!request.headers.get("origin")) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const body = await request.json();
    if (!body || typeof body.id !== "string" || body.confirmTest !== true || typeof body.reason !== "string" || body.reason.trim().length < 10 || body.reason.length > 500) return NextResponse.json({ error: "Confirm this exact submission is test data and provide a reason (10–500 characters)." }, { status: 400 });
    const result = await getConvexClient().mutation(api.interestTestReset.reset, { adminSecret: process.env.ATTENDANCE_ADMIN_SECRET, id: body.id as Id<"interests">, reason: body.reason, confirmTest: true });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const safe = ["Interest not found", "Only applicant submissions can use test reset", "Missing workflow: manual review required", "Linked match or contact history requires manual review", "Reciprocal interest history requires manual review", "Profile-share history requires manual review"].find(text => message.includes(text));
    return NextResponse.json({ error: safe || "Unable to reset test submission. No changes saved. Please retry or ask for manual review." }, { status: 400 });
  }
}
