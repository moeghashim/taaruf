import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { sendConfirmationEmail } from "@/lib/email";
import { api } from "../../../../../convex/_generated/api";
import { createToken, hashToken } from "@/lib/applicant-session";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  try {
    // Verify admin auth
    const adminToken = request.cookies.get("admin_token")?.value;
    const adminPassword = process.env.ADMIN_PASSWORD;
    const salt = process.env.ADMIN_TOKEN_SALT || "taaruf-admin-salt";

    if (!adminToken || !adminPassword) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const expectedToken = crypto
      .createHash("sha256")
      .update(adminPassword + salt)
      .digest("hex");

    if (adminToken !== expectedToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const stripe = getStripe();
    const convexUrl = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      return NextResponse.json({ error: "Convex URL not configured" }, { status: 500 });
    }
    const { ConvexHttpClient } = await import("convex/browser");
    const convexClient = new ConvexHttpClient(convexUrl);

    // Fetch recent Stripe checkout sessions (paid ones)
    const sessions = await stripe.checkout.sessions.list({
      limit: 100,
      status: "complete",
    });

    let fixed = 0;
    let emailsSent = 0;
    const details: string[] = [];

    for (const session of sessions.data) {
      if (session.payment_status !== "paid") continue;

      try {
        const registration = await convexClient.query(
          api.registrations.getByStripeSession,
          { stripeSessionId: session.id }
        );

        if (!registration) continue;

        // Fix payment status if mismatched
        if (registration.paymentStatus !== "paid") {
          await convexClient.mutation(api.registrations.updatePaymentStatus, {
            stripeSessionId: session.id,
            paymentStatus: "paid",
            amountPaid: typeof session.amount_total === "number" ? session.amount_total : undefined,
          });
          fixed++;
          details.push(`Fixed: ${registration.name} (${registration.email})`);
        }

        // Send welcome email if not already sent
        if (!registration.confirmationEmailSent) {
          const loginToken = createToken();
          const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
          await convexClient.mutation(api.applicantAuth.createLoginToken, {
            email: registration.email,
            tokenHash: hashToken(loginToken),
            expiresInMs: SEVEN_DAYS_MS,
          });

          const appUrl = process.env.NEXT_PUBLIC_APP_URL
            || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
            || request.nextUrl.origin;
          const profileUrl = `${appUrl}/api/applicant/login/verify?token=${encodeURIComponent(loginToken)}`;

          const result = await sendConfirmationEmail({
            name: registration.name,
            email: registration.email,
            profileUrl,
          });
          if (result.success) {
            await convexClient.mutation(api.registrations.markEmailSent, {
              stripeSessionId: session.id,
            });
            emailsSent++;
          }
        }
      } catch (err) {
        console.error(`Error processing session ${session.id}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      fixed,
      emailsSent,
      sessionsChecked: sessions.data.length,
      details,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Fix payments error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
