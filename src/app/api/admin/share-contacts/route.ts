import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

export async function POST(request: NextRequest) {
  const password = process.env.ADMIN_PASSWORD;
  const token = request.cookies.get("admin_token")?.value;
  const expected = password ? crypto.createHash("sha256").update(password + (process.env.ADMIN_TOKEN_SALT || "taaruf-admin-salt")).digest("hex") : "";
  if (!token || !expected || token.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { matchId } = await request.json();
    if (typeof matchId !== "string" || !matchId) return NextResponse.json({ error: "matchId required" }, { status: 400 });
    const url = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url) throw new Error("Convex URL not configured");
    await new ConvexHttpClient(url).mutation(api.matches.updateStatus, { id: matchId as Id<"matches">, status: "contact_shared", adminSecret: password });
    return NextResponse.json({ success: true, delivery: "authenticated_portal" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Contact sharing failed" }, { status: 400 });
  }
}
