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
      eventCode,
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

    const convexUrl = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      return NextResponse.json(
        { error: "Convex URL not configured" },
        { status: 500 }
      );
    }
    const { ConvexHttpClient } = await import("convex/browser");
    const convexClient = new ConvexHttpClient(convexUrl);

    const existing = eventCode ? null : await convexClient.query(api.registrations.getByEmail, {
      email: String(email).trim(),
    });
    if (existing) {
      return NextResponse.json(
        {
          error: "An applicant is already registered with this email.",
          code: "email_already_registered",
        },
        { status: 409 }
      );
    }

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
              name: "1Plus1 Matching Registration",
              description: "Registration & background check for the 1Plus1 matching program",
            },
            unit_amount: 1000, // $10.00 in cents
          },
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/register${eventCode ? `/${encodeURIComponent(eventCode)}` : ""}?canceled=true`,
    });

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
      status: "pending",
      eventCode,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (/already registered with this email/i.test(errorMessage)) {
      return NextResponse.json(
        {
          error: "An applicant is already registered with this email.",
          code: "email_already_registered",
        },
        { status: 409 }
      );
    }

    console.error("Checkout session error:", errorMessage);
    return NextResponse.json(
      { error: "Failed to create checkout session", details: errorMessage },
      { status: 500 }
    );
  }
}
