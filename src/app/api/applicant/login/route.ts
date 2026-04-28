import { NextRequest, NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import { getConvexClient } from "@/lib/convex";
import { createToken, hashToken } from "@/lib/applicant-session";
import { sendApplicantMagicLoginEmail } from "@/lib/email";

function getAppUrl(request: NextRequest) {
  return process.env.NEXT_PUBLIC_APP_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
    || request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const token = createToken();
    const convex = getConvexClient();
    const registration = await convex.mutation(api.applicantAuth.createLoginToken, {
      email,
      tokenHash: hashToken(token),
    });

    // Do not reveal whether an email is registered.
    if (!registration) {
      return NextResponse.json({ success: true });
    }

    const loginUrl = `${getAppUrl(request)}/api/applicant/login/verify?token=${encodeURIComponent(token)}`;
    const emailResult = await sendApplicantMagicLoginEmail({
      name: registration.name,
      email: registration.email,
      loginUrl,
    });

    if (!emailResult.success) {
      return NextResponse.json({ error: emailResult.error || "Failed to send login email" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

