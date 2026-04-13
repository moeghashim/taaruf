import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
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
      ethnicity,
      prayerCommitment,
      hijabResponse,
      spouseRequirement1,
      spouseRequirement2,
      spouseRequirement3,
      shareableBio,
      photoSharingPermission,
      imageStorageIds,
    } = body;

    // Validate required fields
    if (
      !name || !age || !gender || !maritalStatus || !education || !job || !email || !phone ||
      !ethnicity || !prayerCommitment || !hijabResponse || !spouseRequirement1 || !spouseRequirement2 ||
      !spouseRequirement3 || !shareableBio || !photoSharingPermission || !Array.isArray(imageStorageIds) || imageStorageIds.length < 1
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
      || "http://localhost:3000";

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

    // Check slot capacity to determine if waitlisted
    const convexUrl = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      return NextResponse.json(
        { error: "Convex URL not configured" },
        { status: 500 }
      );
    }
    const { ConvexHttpClient } = await import("convex/browser");
    const convexClient = new ConvexHttpClient(convexUrl);

    const stats = await convexClient.query(api.registrations.getStats);
    const isFull = gender === "male"
      ? stats.maleCount >= stats.maleLimit
      : stats.femaleCount >= stats.femaleLimit;

    // Save registration to Convex
    await convexClient.mutation(api.registrations.create, {
      name,
      age: Number(age),
      gender: gender as "male" | "female",
      maritalStatus,
      education,
      job,
      email,
      phone,
      ethnicity,
      imageStorageIds,
      prayerCommitment,
      hijabResponse,
      spouseRequirement1,
      spouseRequirement2,
      spouseRequirement3,
      shareableBio,
      photoSharingPermission,
      describeYourself: shareableBio,
      lookingFor: [spouseRequirement1, spouseRequirement2, spouseRequirement3].join(", "),
      stripeSessionId: session.id,
      paymentStatus: "pending",
      status: isFull ? "waitlisted" : "pending",
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Checkout session error:", errorMessage);
    return NextResponse.json(
      { error: "Failed to create checkout session", details: errorMessage },
      { status: 500 }
    );
  }
}
