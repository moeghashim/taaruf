import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import { createToken, hashToken } from "@/lib/applicant-session";
import { getConvexClient } from "@/lib/convex";
import { sendEventRegistrationStatusEmail } from "@/lib/email";

type EmailKind = "approved" | "waitlisted" | "confirmation_request" | "cancelled" | "reminder";

async function isAdminAuthenticated(request: NextRequest) {
  const adminToken = request.cookies.get("admin_token")?.value;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const salt = process.env.ADMIN_TOKEN_SALT || "taaruf-admin-salt";

  if (!adminToken || !adminPassword) return false;

  const expectedToken = crypto.createHash("sha256").update(adminPassword + salt).digest("hex");
  return adminToken === expectedToken;
}

function formatDateTime(timestamp: number) {
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getAppUrl(request: NextRequest) {
  return process.env.NEXT_PUBLIC_APP_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
    || request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  try {
    if (!(await isAdminAuthenticated(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    if (!body.eventRegistrationId || !body.kind) {
      return NextResponse.json({ error: "eventRegistrationId and kind are required" }, { status: 400 });
    }

    const convex = getConvexClient();
    const claim = await convex.mutation(api.events.claimEventRegistrationEmail, {
      eventRegistrationId: body.eventRegistrationId,
      kind: body.kind as EmailKind,
      force: body.force === true,
    });

    if (!claim.claimed) {
      return NextResponse.json({ success: true, alreadySent: true });
    }

    if (!claim.emailId || !claim.name || !claim.email || !claim.eventTitle || !claim.eventStartsAt || !claim.eventLocation || !claim.kind) {
      return NextResponse.json({ error: "Email claim is missing required data" }, { status: 500 });
    }

    let applicantPortalUrl: string | undefined;
    if (claim.kind === "confirmation_request" || claim.kind === "reminder") {
      const loginToken = createToken();
      const loginRegistration = await convex.mutation(api.applicantAuth.createLoginToken, {
        email: claim.email,
        tokenHash: hashToken(loginToken),
        expiresInMs: 48 * 60 * 60 * 1000,
      });
      if (loginRegistration) {
        applicantPortalUrl = `${getAppUrl(request)}/api/applicant/login/verify?token=${encodeURIComponent(loginToken)}`;
      }
    }

    const result = await sendEventRegistrationStatusEmail({
      name: claim.name,
      email: claim.email,
      eventTitle: claim.eventTitle,
      eventDate: formatDateTime(claim.eventStartsAt),
      eventLocation: claim.eventLocation,
      kind: claim.kind as EmailKind,
      applicantPortalUrl,
    });

    if (!result.success) {
      await convex.mutation(api.events.recordEventRegistrationEmailFailure, {
        emailId: claim.emailId,
        error: result.error || "Failed to send event registration email",
      });
      return NextResponse.json({ success: false, error: result.error }, { status: 502 });
    }

    await convex.mutation(api.events.recordEventRegistrationEmailSuccess, {
      emailId: claim.emailId,
    });

    return NextResponse.json({ success: true, providerId: result.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
