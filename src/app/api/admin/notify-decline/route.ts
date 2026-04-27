import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { sendInterestClosedEmail } from "@/lib/email";

function isAdmin(request: NextRequest): boolean {
  const adminToken = request.cookies.get("admin_token")?.value;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const salt = process.env.ADMIN_TOKEN_SALT || "taaruf-admin-salt";

  if (!adminToken || !adminPassword) return false;

  const expectedToken = crypto.createHash("sha256").update(adminPassword + salt).digest("hex");
  return adminToken === expectedToken;
}

export async function POST(request: NextRequest) {
  try {
    if (!isAdmin(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { interestId } = await request.json();
    if (!interestId) {
      return NextResponse.json({ error: "interestId is required" }, { status: 400 });
    }

    const convexUrl = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      return NextResponse.json({ error: "Convex URL not configured" }, { status: 500 });
    }

    const convexClient = new ConvexHttpClient(convexUrl);
    const claim = await convexClient.mutation(api.interests.claimDeclineNotification, {
      id: interestId,
    });

    if (!claim.claimed) {
      return NextResponse.json({
        success: true,
        skipped: "already_sent",
      });
    }

    if (!claim.requesterEmail || !claim.requesterName) {
      throw new Error("Decline notification claim did not include requester contact details");
    }

    const emailResult = await sendInterestClosedEmail({
      requesterEmail: claim.requesterEmail,
      requesterName: claim.requesterName,
      targetNumber: claim.targetNumber,
    });

    if (!emailResult.success) {
      await convexClient.mutation(api.interests.recordDeclineNotificationFailure, {
        id: interestId,
        error: emailResult.error || "Failed to send interest closed email",
      });

      return NextResponse.json(
        { success: false, error: emailResult.error || "Failed to send interest closed email" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      providerId: emailResult.id,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
