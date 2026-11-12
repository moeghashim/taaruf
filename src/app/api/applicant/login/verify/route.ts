import { applicantDestination, applicantLoginHref } from "@/lib/applicant-destination";
import { getAdminSecret } from "@/lib/admin-server";
import { NextRequest, NextResponse } from "next/server";
import { api } from "../../../../../../convex/_generated/api";
import { applicantSessionCookie, createToken, hashToken } from "@/lib/applicant-session";
import { getConvexClient } from "@/lib/convex";

function redirect(url: URL) {
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function GET(request: NextRequest) {
  const destination = applicantDestination(request.nextUrl.searchParams.get("next"));
  const login = new URL(applicantLoginHref(destination), request.url);
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    login.searchParams.set("error", "missing");
    return redirect(login);
  }

  const sessionToken = createToken();
  const convex = getConvexClient();
  const claimed = await convex.mutation(api.applicantAuth.claimLoginToken, { adminSecret: getAdminSecret(),
    tokenHash: hashToken(token),
    sessionHash: hashToken(sessionToken),
  });

  if (!claimed) {
    login.searchParams.set("error", "invalid");
    return redirect(login);
  }

  const response = redirect(new URL(destination, request.url));
  response.cookies.set(applicantSessionCookie, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });

  return response;
}

