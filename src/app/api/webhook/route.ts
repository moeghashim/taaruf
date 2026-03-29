import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getConvexClient } from "@/lib/convex";
import { api } from "../../../../convex/_generated/api";
import Stripe from "stripe";

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

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

    let event: Stripe.Event;
    try {
      const stripe = getStripe();
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 400 }
      );
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const convexClient = getConvexClient();
        await convexClient.mutation(api.registrations.updatePaymentStatus, {
          stripeSessionId: session.id,
          paymentStatus: "paid",
          amountPaid: session.amount_total ?? undefined,
        });
        break;
      }
      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        const convexClient = getConvexClient();
        await convexClient.mutation(api.registrations.updatePaymentStatus, {
          stripeSessionId: session.id,
          paymentStatus: "failed",
        });
        break;
      }
      default:
        // Unhandled event type
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}
