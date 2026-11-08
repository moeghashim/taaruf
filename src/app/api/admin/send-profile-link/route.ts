import { adminRequestError, getAdminSecret } from "@/lib/admin-server";
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

  const expectedToken = crypto
    .createHash("sha256")
    .update(adminPassword + salt)
    .digest("hex");

  return adminToken === expectedToken;
}

export async function POST(request: NextRequest) {
  const denied = adminRequestError(request);
  if (denied) return denied;
  try {
    if (!isAdmin(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { registrationIds } = await request.json();
    if (!Array.isArray(registrationIds) || registrationIds.length === 0) {
      return NextResponse.json({ error: "registrationIds is required" }, { status: 400 });
    }

    const convexUrl = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      return NextResponse.json({ error: "Convex URL not configured" }, { status: 500 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
      || "http://localhost:3000";

    const convexClient = new ConvexHttpClient(convexUrl);
    const results: { registrationId: string; success: boolean; error?: string }[] = [];

    for (const registrationId of registrationIds) {
      const registration = await convexClient.query(api.registrations.getById, { adminSecret: getAdminSecret(),  id: registrationId });

      if (!registration) {
        results.push({ registrationId, success: false, error: "Registration not found" });
        continue;
      }

      if (registration.profileCompletionStatus === "completed") {
        results.push({ registrationId, success: false, error: "Profile already completed" });
        continue;
      }

      const token = await convexClient.mutation(api.registrations.ensureProfileAccessToken, {
        adminSecret: getAdminSecret(),
        id: registration._id,
        token: crypto.randomBytes(24).toString("hex"),
      });

      const profileUrl = `${appUrl}/profile/${token}`;
      const emailResult = await sendProfileCompletionEmail({
        name: registration.name,
        email: registration.email,
        profileUrl,
      });

      await convexClient.mutation(api.registrations.markProfileUpdateEmailSent, { adminSecret: getAdminSecret(),
        id: registration._id,
        sent: emailResult.success,
        error: emailResult.error,
      });

      results.push({
        registrationId,
        success: emailResult.success,
        error: emailResult.error,
      });
    }

    return NextResponse.json({
      success: true,
      results,
      summary: {
        requested: registrationIds.length,
        sent: results.filter((result) => result.success).length,
        failed: results.filter((result) => !result.success).length,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to complete admin request" },
      { status: 500 }
    );
  }
}
