"use client";

import { useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import Link from "next/link";
import { Suspense } from "react";
import { LogoMark } from "@/components/admin/primitives/logo-mark";

type Tone = "success" | "warning" | "error" | "pending";

interface StatusViewModel {
  tone: Tone;
  title: string;
  body: string;
  bullets?: string[];
  action?: { label: string; href: string };
}

function StatusPanel({ status }: { status: StatusViewModel }) {
  const symbol =
    status.tone === "success"
      ? "✓"
      : status.tone === "warning"
      ? "✓"
      : status.tone === "error"
      ? "!"
      : null;

  return (
    <section className="panel applicant-status-panel">
      <div className="applicant-status-body">
        <div className={`status-mark ${status.tone}`}>
          {status.tone === "pending" ? <span className="status-spinner" /> : symbol}
        </div>
        <h2>{status.title}</h2>
        <p>{status.body}</p>
        {status.bullets && (
          <ul className="status-list">
            {status.bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
        )}
        {status.action && (
          <Link href={status.action.href} className="btn btn-primary full">
            <span>{status.action.label}</span>
          </Link>
        )}
      </div>
    </section>
  );
}

function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  const registration = useQuery(
    api.registrations.getByStripeSession,
    sessionId ? { stripeSessionId: sessionId } : "skip"
  );

  let status: StatusViewModel;

  if (!sessionId) {
    status = {
      tone: "success",
      title: "Thank you.",
      body: "Your registration has been received.",
      action: { label: "Return to home", href: "/" },
    };
  } else if (!registration || registration.paymentStatus === "pending") {
    status = {
      tone: "pending",
      title: "Verifying your payment...",
      body: "Please wait while we confirm your payment. This usually takes just a few seconds.",
    };
  } else if (registration.paymentStatus === "failed") {
    status = {
      tone: "error",
      title: "Payment failed.",
      body: "Your payment could not be processed. Please try registering again.",
      action: { label: "Try again", href: "/register" },
    };
  } else {
    status = {
      tone: "success",
      title: "Welcome to 1Plus1.",
      body:
        "Your payment has been received. We’ve sent you an email with a secure link to your applicant dashboard, where you can complete your profile.",
      bullets: [
        "Check your email for your applicant dashboard link.",
        "Complete your profile so our team can review it.",
      ],
      action: { label: "Open applicant login", href: "/login" },
    };
  }

  return <StatusPanel status={status} />;
}

export default function SuccessPage() {
  return (
    <main data-admin className="min-h-screen">
      <div className="applicant-status">
        <header className="applicant-status-head">
          <div className="brand compact">
            <LogoMark />
            <div>
              <div className="brand-name">Taaruf</div>
              <div className="brand-tag">Registration</div>
            </div>
          </div>
        </header>
        <Suspense
          fallback={
            <StatusPanel
              status={{
                tone: "pending",
                title: "Loading...",
                body: "One moment while we look up your registration.",
              }}
            />
          }
        >
          <SuccessContent />
        </Suspense>
      </div>
    </main>
  );
}
