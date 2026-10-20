import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
export async function POST(request: NextRequest) {
  const password = process.env.ADMIN_PASSWORD;
  const token = request.cookies.get("admin_token")?.value;
  const expected = password ? crypto.createHash("sha256").update(password + (process.env.ADMIN_TOKEN_SALT || "taaruf-admin-salt")).digest("hex") : "";
  if (!token || !expected || token !== expected) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { registrationId } = await request.json();
    const url = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url || !registrationId) throw new Error("Invalid request");
    await new ConvexHttpClient(url).mutation(api.registrations.revokeApproval, { id: registrationId as Id<"registrations">, adminSecret: password! });
    return NextResponse.json({ success: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to revoke" }, { status: 400 }); }
}
