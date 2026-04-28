import { NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import { applicantSessionCookie, getApplicantSessionHash } from "@/lib/applicant-session";
import { getConvexClient } from "@/lib/convex";

export async function POST() {
  const sessionHash = await getApplicantSessionHash();
  if (sessionHash) {
    await getConvexClient().mutation(api.applicantAuth.revokeSession, { sessionHash });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(applicantSessionCookie, "", {
    httpOnly: true,
    expires: new Date(0),
    path: "/",
  });
  return response;
}

