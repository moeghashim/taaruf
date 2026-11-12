import { getAdminSecret } from "@/lib/admin-server";
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import { getConvexClient } from "@/lib/convex";

export async function GET(request: NextRequest) {
  const password = process.env.ADMIN_PASSWORD;
  const token = request.cookies.get("admin_token")?.value;
  const expected = password ? crypto.createHash("sha256").update(password + (process.env.ADMIN_TOKEN_SALT || "taaruf-admin-salt")).digest("hex") : "";
  if (!token || !/^[a-f0-9]{64}$/.test(token) || !expected || token.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) return NextResponse.json({ error: "Your admin session has expired. Sign in again." }, { status: 401 });
  try {
    const rows = await getConvexClient().query(api.matches.getCandidates, { adminSecret: getAdminSecret() });
    return NextResponse.json(rows.map(({ _id, name, gender, publicApplicantNumber, backgroundMatchmakingOptIn }) => ({ _id, name, gender, publicApplicantNumber, backgroundMatchmakingOptIn })), { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Unable to load eligible applicants." }, { status: 503 }); }
}
