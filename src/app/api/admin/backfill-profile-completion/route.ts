import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { sendProfileCompletionEmail } from "@/lib/email";

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

    const { dryRun = true, limit } = await request.json().catch(() => ({}));
    const convexUrl = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      return NextResponse.json({ error: "Convex URL not configured" }, { status: 500 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
      || "http://localhost:3000";

    const convexClient = new ConvexHttpClient(convexUrl);
    const backfill = await convexClient.action(
      api.migrations.profileCompletion.backfillProfileCompletionStatuses,
      {
        dryRun: Boolean(dryRun),
        limit: typeof limit === "number" ? limit : undefined,
      }
    );
    const emailResults: Array<{ registrationId: string; success: boolean; error?: string }> = [];

    if (!dryRun) {
      for (const item of backfill.needsProfileEmail) {
        const registration = await convexClient.query(api.registrations.getById, {
          id: item.id,
        });
        if (!registration) {
          emailResults.push({
            registrationId: item.id,
            success: false,
            error: "Registration not found",
          });
          continue;
        }

        const token = registration.profileAccessToken || crypto.randomBytes(24).toString("hex");
        if (!registration.profileAccessToken) {
          await convexClient.mutation(api.registrations.setProfileAccessToken, {
            id: registration._id,
            token,
          });
        }

        const emailResult = await sendProfileCompletionEmail({
          name: registration.name,
          email: registration.email,
          profileUrl: `${appUrl}/profile/${token}`,
        });

        await convexClient.mutation(api.registrations.markProfileUpdateEmailSent, {
          id: registration._id,
          sent: emailResult.success,
          error: emailResult.error,
        });

        emailResults.push({
          registrationId: registration._id,
          success: emailResult.success,
          error: emailResult.error,
        });
      }
    }

    return NextResponse.json({
      success: true,
      backfill,
      emailResults,
      summary: {
        scanned: backfill.scanned,
        completed: backfill.completed.length,
        needsProfileEmail: backfill.needsProfileEmail.length,
        sent: emailResults.filter((result) => result.success).length,
        failed: emailResults.filter((result) => !result.success).length,
        dryRun: Boolean(dryRun),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
