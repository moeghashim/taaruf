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
  if (!token || !expected || token.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) return NextResponse.json({ error: "Your admin session has expired. Sign in again." }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      // Next normalizes loopback/proxy URLs; Host retains the browser-facing authority.
      const parsed = new URL(origin);
      if (!["http:", "https:"].includes(parsed.protocol) || parsed.host !== (request.headers.get("host") || request.nextUrl.host)) throw new Error("Origin mismatch");
    } catch { return NextResponse.json({ error: "Invalid request origin." }, { status: 403 }); }
  }
  try {
    const body = await request.json();
    if (!body || typeof body.maleRegistrationId !== "string" || !body.maleRegistrationId || typeof body.femaleRegistrationId !== "string" || !body.femaleRegistrationId || (body.adminNotes !== undefined && (typeof body.adminNotes !== "string" || body.adminNotes.length > 2000))) return NextResponse.json({ error: "Select both applicants and keep notes under 2,000 characters." }, { status: 400 });
    const matchId = await getConvexClient().mutation(api.matches.create, { adminSecret: password!, maleRegistrationId: body.maleRegistrationId as Id<"registrations">, femaleRegistrationId: body.femaleRegistrationId as Id<"registrations">, adminNotes: body.adminNotes });
    return NextResponse.json({ matchId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof ConvexError && typeof error.data === "string" ? error.data : "Unable to create match. Refresh and try again; if this continues, contact support." }, { status: 400 });
  }
}
