"use client";

import { useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle, Loader2 } from "lucide-react";
import { Suspense } from "react";
import type { Id } from "../../../convex/_generated/dataModel";

function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const registrationId = searchParams.get("registration_id");

  const registrationBySession = useQuery(
    api.registrations.getByStripeSession,
    sessionId ? { stripeSessionId: sessionId } : "skip"
  );
  const registrationById = useQuery(
    api.registrations.getById,
    registrationId ? { id: registrationId as Id<"registrations"> } : "skip"
  );

  const registration = registrationId ? registrationById : registrationBySession;

  // No session_id — generic success
  if (!sessionId && !registrationId) {
    return (
      <Card className="w-full max-w-md p-8 shadow-lg text-center">
        <div className="mb-6 flex justify-center">
          <CheckCircle className="h-16 w-16 text-green-500" />
        </div>
        <h1 className="text-3xl font-bold text-slate-900 mb-3">Thank You!</h1>
        <p className="text-slate-600 mb-6">Your registration has been received.</p>
        <Link href="/">
          <Button className="w-full">Return to Home</Button>
        </Link>
      </Card>
    );
  }

  if (registration === null) {
    return (
      <Card className="w-full max-w-md p-8 shadow-lg text-center">
        <h1 className="text-2xl font-bold text-slate-900 mb-3">
          Registration Not Found
        </h1>
        <p className="text-slate-600 mb-6">
          We could not find a registration for this checkout session. Please contact the 1Plus1 team if your payment completed.
        </p>
        <Link href="/register">
          <Button className="w-full">Return to Registration</Button>
        </Link>
      </Card>
    );
  }

  // Payment still being verified
  if (registration === undefined || registration.paymentStatus === "pending") {
    return (
      <Card className="w-full max-w-md p-8 shadow-lg text-center">
        <div className="mb-6 flex justify-center">
          <Loader2 className="h-16 w-16 text-blue-500 animate-spin" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-3">
          Verifying Your Payment...
        </h1>
        <p className="text-slate-600">
          Please wait while we confirm your payment. This usually takes just a few seconds.
        </p>
      </Card>
    );
  }

  // Payment failed
  if (registration.paymentStatus === "failed") {
    return (
      <Card className="w-full max-w-md p-8 shadow-lg text-center">
        <div className="mb-6 flex justify-center">
          <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center">
            <span className="text-red-500 text-3xl font-bold">!</span>
          </div>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-3">Payment Failed</h1>
        <p className="text-slate-600 mb-6">
          Your payment could not be processed. Please try registering again.
        </p>
        <Link href="/register">
          <Button className="w-full">Try Again</Button>
        </Link>
      </Card>
    );
  }

  // Waitlisted
  if (registration.status === "waitlisted") {
    return (
      <Card className="w-full max-w-md p-8 shadow-lg text-center">
        <div className="mb-6 flex justify-center">
          <CheckCircle className="h-16 w-16 text-amber-500" />
        </div>

        <h1 className="text-3xl font-bold text-slate-900 mb-3">
          You&apos;re on the Waitlist!
        </h1>

        <p className="text-lg text-slate-600 mb-2">
          Thank you for registering with 1 Plus 1
        </p>

        <p className="text-slate-600 mb-6">
          Your payment has been received. All current slots are full, so you have been placed
          on our waitlist. We will notify you if a spot becomes available. If you are not
          accepted, you will receive a full refund.
        </p>

        <div className="space-y-3 text-left mb-8">
          <h3 className="font-semibold text-slate-900">What happens next:</h3>
          <ul className="space-y-2 text-sm text-slate-600">
            <li className="flex gap-3">
              <span className="text-amber-500 font-bold">&#10003;</span>
              <span>Your spot on the waitlist is secured</span>
            </li>
            <li className="flex gap-3">
              <span className="text-amber-500 font-bold">&#10003;</span>
              <span>You will be contacted if a slot opens up</span>
            </li>
            <li className="flex gap-3">
              <span className="text-amber-500 font-bold">&#10003;</span>
              <span>Your payment will be applied to your registration</span>
            </li>
          </ul>
        </div>

        <Link href="/">
          <Button className="w-full">Return to Home</Button>
        </Link>
      </Card>
    );
  }

  // Payment confirmed — registered
  return (
    <Card className="w-full max-w-md p-8 shadow-lg text-center">
      <div className="mb-6 flex justify-center">
        <CheckCircle className="h-16 w-16 text-green-500" />
      </div>

      <h1 className="text-3xl font-bold text-slate-900 mb-3">
        Registration Confirmed!
      </h1>

      <p className="text-lg text-slate-600 mb-2">
        Welcome to 1 Plus 1 Matching & Taaruf
      </p>

      <p className="text-slate-600 mb-6">
        Your payment has been received and your application is under review. Our team will
        carefully evaluate your profile and get back to you within 24 hours.
      </p>

      <div className="space-y-3 text-left mb-8">
        <h3 className="font-semibold text-slate-900">Next Steps:</h3>
        <ul className="space-y-2 text-sm text-slate-600">
          <li className="flex gap-3">
            <span className="text-green-500 font-bold">&#10003;</span>
            <span>Check your email for confirmation</span>
          </li>
          <li className="flex gap-3">
            <span className="text-green-500 font-bold">&#10003;</span>
            <span>Our team will review your profile within 24 hours</span>
          </li>
          <li className="flex gap-3">
            <span className="text-green-500 font-bold">&#10003;</span>
            <span>You will receive an approval or rejection decision</span>
          </li>
        </ul>
      </div>

      <Link href="/">
        <Button className="w-full">Return to Home</Button>
      </Link>
    </Card>
  );
}

export default function SuccessPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center px-4 py-12">
      <Suspense
        fallback={
          <Card className="w-full max-w-md p-8 shadow-lg text-center">
            <Loader2 className="h-16 w-16 text-blue-500 animate-spin mx-auto" />
          </Card>
        }
      >
        <SuccessContent />
      </Suspense>
    </main>
  );
}
