import { isManualMatchDraft } from "@/lib/manual-match-draft";
import { adminRequestError, getAdminSecret } from "@/lib/admin-server";
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { sendMatchNotificationEmail } from "@/lib/email";

function isAdmin(request: NextRequest): boolean {
  const adminToken = request.cookies.get("admin_token")?.value;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const salt = process.env.ADMIN_TOKEN_SALT || "taaruf-admin-salt";

  if (!adminToken || !adminPassword) return false;

  const expectedToken = crypto.createHash("sha256").update(adminPassword + salt).digest("hex");
  return adminToken === expectedToken;
}

export async function POST(request: NextRequest) {
  const denied = adminRequestError(request);
  if (denied) return denied;
  try {
    if (!isAdmin(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { matchId } = await request.json();
    if (!matchId) {
      return NextResponse.json({ error: "matchId is required" }, { status: 400 });
    }

    const convexUrl = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      return NextResponse.json({ error: "Convex URL not configured" }, { status: 500 });
    }

    const convexClient = new ConvexHttpClient(convexUrl);
    const match = await convexClient.query(api.matches.getById, { adminSecret: getAdminSecret(),  id: matchId });

    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    if (isManualMatchDraft(match) || (!match.interestId && (match.interestType === "admin_suggested" || match.initiatedBy === "admin_recommendation"))) return NextResponse.json({ error: "Use the explicit matchmaker presentation workflow. This endpoint cannot notify matchmaker matches." }, { status: 409 });

    const male = await convexClient.query(api.registrations.getById, { adminSecret: getAdminSecret(),  id: match.maleRegistrationId });
    const female = await convexClient.query(api.registrations.getById, { adminSecret: getAdminSecret(),  id: match.femaleRegistrationId });

    if (!male || !female) {
      return NextResponse.json({ error: "Matched applicant not found" }, { status: 404 });
    }

    const results = [] as { registrationId: string; email: string; success: boolean; error?: string; providerId?: string }[];

    for (const registration of [male, female]) {
      await convexClient.mutation(api.matches.assertNotificationEligible, { id: match._id, adminSecret: getAdminSecret() });
      const emailResult = await sendMatchNotificationEmail({
        name: registration.name,
        email: registration.email,
      });

      console.log("Match notification result", {
        matchId,
        registrationId: registration._id,
        email: registration.email,
        success: emailResult.success,
        error: emailResult.error,
        providerId: emailResult.id,
      });

      results.push({
        registrationId: registration._id,
        email: registration.email,
        success: emailResult.success,
        error: emailResult.error,
        providerId: emailResult.id,
      });
    }

    const success = results.every((result) => result.success);
    await convexClient.mutation(api.matches.markNotificationSent, { adminSecret: getAdminSecret(),
      id: match._id,
      sent: success,
      error: success ? undefined : results.filter((result) => !result.success).map((result) => `${result.email}: ${result.error}`).join(" | "),
    });

    return NextResponse.json({
      success,
      results,
      summary: {
        requested: 2,
        sent: results.filter((result) => result.success).length,
        failed: results.filter((result) => !result.success).length,
      },
    }, { status: success ? 200 : 502 });
  } catch (error) {
    if (/archived|not active/i.test(String(error))) return NextResponse.json({ success: false, skipped: "ineligible", error: "Matching notification stopped because the connection is no longer eligible." }, { status: 409 });
    return NextResponse.json(
      { error: "Unable to complete admin request" },
      { status: 500 }
    );
  }
}
