import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { api } from "../../../../convex/_generated/api";
import Stripe from "stripe";

function getAppUrl(request: NextRequest) {
  return process.env.NEXT_PUBLIC_APP_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
    || request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      return NextResponse.json(
        { error: "Missing stripe-signature header" },
        { status: 400 }
      );
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET not configured");
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    let event: Stripe.Event;
    try {
      const stripe = getStripe();
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      // If signature fails, it may be the other webhook payload type (snapshot vs thin).
      // Return 200 to prevent Stripe from retrying endlessly.
      console.error("Webhook signature verification failed:", err instanceof Error ? err.message : err);
      return NextResponse.json({ received: true, skipped: "signature_mismatch" });
    }

    // Only process checkout session events
    if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.expired") {
      return NextResponse.json({ received: true });
    }

    const convexUrl = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      console.error("Convex URL not configured");
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }
    const { ConvexHttpClient } = await import("convex/browser");
    const convexClient = new ConvexHttpClient(convexUrl);

    const session = event.data.object as Stripe.Checkout.Session;

    if (event.type === "checkout.session.completed") {
      try {
        await convexClient.mutation(api.registrations.updatePaymentStatus, {
          stripeSessionId: session.id,
          paymentStatus: "paid",
          amountPaid: typeof session.amount_total === "number" ? session.amount_total : undefined,
        });
      } catch (err) {
        console.error("Failed to update payment status:", err instanceof Error ? err.message : err);
        return NextResponse.json({ error: "Failed to update registration" }, { status: 500 });
      }

      // Send welcome email with profile-edit link (non-blocking — failure doesn't break webhook)
      try {
        const registration = await convexClient.query(
          api.registrations.getByStripeSession,
          { stripeSessionId: session.id }
        );
        if (registration && registration.email) {
          let profileAccessToken = registration.profileAccessToken;
          if (!profileAccessToken) {
            profileAccessToken = crypto.randomBytes(24).toString("hex");
            await convexClient.mutation(api.registrations.setProfileAccessToken, {
              id: registration._id,
              token: profileAccessToken,
            });
          }

          const profileUrl = `${getAppUrl(request)}/profile/${profileAccessToken}`;

          const { sendConfirmationEmail } = await import("@/lib/email");
          const result = await sendConfirmationEmail({
            name: registration.name,
            email: registration.email,
            profileUrl,
          });
          if (result.success) {
            await convexClient.mutation(api.registrations.markEmailSent, {
              stripeSessionId: session.id,
            });
          }
        }
      } catch (err) {
        console.error("Failed to send welcome email:", err instanceof Error ? err.message : err);
        // Don't return error — payment was already confirmed
      }
    } else if (event.type === "checkout.session.expired") {
      try {
        await convexClient.mutation(api.registrations.updatePaymentStatus, {
          stripeSessionId: session.id,
          paymentStatus: "failed",
        });
      } catch (err) {
        console.error("Failed to update expired session:", err instanceof Error ? err.message : err);
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}
