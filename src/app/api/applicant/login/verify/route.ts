import { NextRequest, NextResponse } from "next/server";
import { api } from "../../../../../../convex/_generated/api";
import { applicantSessionCookie, createToken, hashToken } from "@/lib/applicant-session";
import { getConvexClient } from "@/lib/convex";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/login?error=missing", request.url));
  }

  const sessionToken = createToken();
  const convex = getConvexClient();
  const claimed = await convex.mutation(api.applicantAuth.claimLoginToken, {
    tokenHash: hashToken(token),
    sessionHash: hashToken(sessionToken),
  });

  if (!claimed) {
    return NextResponse.redirect(new URL("/login?error=invalid", request.url));
  }

  const response = NextResponse.redirect(new URL("/me", request.url));
  response.cookies.set(applicantSessionCookie, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });

  return response;
}

