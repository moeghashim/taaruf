import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { api } from "../../../../convex/_generated/api";

const FREE_PROMO_CODE = "moesmoes";

function isGender(value: unknown): value is "male" | "female" {
  return value === "male" || value === "female";
}

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
      backgroundCheckConsent,
      promoCode,
    } = body;

    const parsedAge = Number(age);
    const normalizedPromoCode =
      typeof promoCode === "string" ? promoCode.trim().toLowerCase() : "";

    if (
      typeof name !== "string" ||
      !name.trim() ||
      !Number.isInteger(parsedAge) ||
      parsedAge < 18 ||
      parsedAge > 99 ||
      !isGender(gender) ||
      typeof maritalStatus !== "string" ||
      !maritalStatus.trim() ||
      typeof education !== "string" ||
      !education.trim() ||
      typeof job !== "string" ||
      !job.trim() ||
      typeof email !== "string" ||
      !email.trim() ||
      typeof phone !== "string" ||
      !phone.trim() ||
      backgroundCheckConsent !== true
    ) {
      return NextResponse.json(
        { error: "Missing or invalid required fields" },
        { status: 400 }
      );
    }

    if (normalizedPromoCode && normalizedPromoCode !== FREE_PROMO_CODE) {
      return NextResponse.json(
        { error: "Invalid promo code" },
        { status: 400 }
      );
    }

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

    const appUrl = process.env.NEXT_PUBLIC_APP_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
      || "http://localhost:3000";

    const registrationArgs = {
      name: name.trim(),
      age: parsedAge,
      gender,
      maritalStatus,
      education,
      job: job.trim(),
      email: email.trim(),
      phone: phone.trim(),
      describeYourself: typeof describeYourself === "string" && describeYourself.trim()
        ? describeYourself.trim()
        : undefined,
      lookingFor: typeof lookingFor === "string" && lookingFor.trim()
        ? lookingFor.trim()
        : undefined,
      backgroundCheck: "consented",
      status: isFull ? "waitlisted" as const : "pending" as const,
    };

    if (normalizedPromoCode === FREE_PROMO_CODE) {
      const registrationId = await convexClient.mutation(api.registrations.create, {
        ...registrationArgs,
        paymentStatus: "paid",
        amountPaid: 0,
        promoCode: FREE_PROMO_CODE,
      });

      return NextResponse.json({
        url: `${appUrl}/success?registration_id=${registrationId}`,
      });
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
              name: "1Plus1 Pre-Marriage Workshop Registration",
              description: "Registration fee for the 1Plus1 Pre-Marriage Workshop",
            },
            unit_amount: 1000, // $10.00 in cents
          },
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/cancelled`,
    });

    // Save registration to Convex
    await convexClient.mutation(api.registrations.create, {
      ...registrationArgs,
      stripeSessionId: session.id,
      paymentStatus: "pending",
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
