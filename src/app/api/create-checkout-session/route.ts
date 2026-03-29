import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getConvexClient } from "@/lib/convex";
import { api } from "../../../../convex/_generated/api";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      name,
      age,
      gender,
      maritalStatus,
      education,
      job,
      email,
      phone,
      describeYourself,
      lookingFor,
      backgroundCheck,
    } = body;

    // Validate required fields
    if (!name || !age || !gender || !maritalStatus || !education || !job || !email || !phone) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const origin = request.headers.get("origin") || request.nextUrl.origin;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || origin || "http://localhost:3000";

    // Create Stripe Checkout session
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      allow_promotion_codes: true,
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "1Plus1 Pre-Marriage Workshop Registration",
              description: "Registration fee for the 1Plus1 Pre-Marriage Workshop",
            },
            unit_amount: 1000, // $10.00 in cents
          },
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/register?canceled=true`,
    });

    // Save registration to Convex with pending payment status
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      return NextResponse.json(
        { error: "NEXT_PUBLIC_CONVEX_URL not configured", details: "missing" },
        { status: 500 }
      );
    }
    const { ConvexHttpClient } = await import("convex/browser");
    const convexClient = new ConvexHttpClient(convexUrl);
    await convexClient.mutation(api.registrations.create, {
      name,
      age: Number(age),
      gender: gender as "male" | "female",
      maritalStatus,
      education,
      job,
      email,
      phone,
      describeYourself: describeYourself || undefined,
      lookingFor: lookingFor || undefined,
      backgroundCheck: backgroundCheck || undefined,
      stripeSessionId: session.id,
      paymentStatus: "pending",
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Checkout session error:", errorMessage, error);
    return NextResponse.json(
      { error: "Failed to create checkout session", details: errorMessage },
      { status: 500 }
    );
  }
}
