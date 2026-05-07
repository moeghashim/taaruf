import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
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
    });

    if (!claim.claimed) {
      return NextResponse.json({ success: true, alreadySent: true });
    }

    if (!claim.emailId || !claim.name || !claim.email || !claim.eventTitle || !claim.eventStartsAt || !claim.eventLocation || !claim.kind) {
      return NextResponse.json({ error: "Email claim is missing required data" }, { status: 500 });
    }

    const result = await sendEventRegistrationStatusEmail({
      name: claim.name,
      email: claim.email,
      eventTitle: claim.eventTitle,
      eventDate: formatDateTime(claim.eventStartsAt),
      eventLocation: claim.eventLocation,
      kind: claim.kind as EmailKind,
    });

    if (!result.success) {
      await convex.mutation(api.events.recordEventRegistrationEmailFailure, {
        emailId: claim.emailId,
        error: result.error || "Failed to send event registration email",
      });
      return NextResponse.json({ success: false, error: result.error }, { status: 502 });
    }

    return NextResponse.json({ success: true, providerId: result.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
