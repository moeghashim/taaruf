"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { LogoMark } from "@/components/admin/primitives/logo-mark";
import { Ico } from "@/components/admin/primitives/icons";

export default function ApplicantLoginPage() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("error")) {
      setError("That login link is invalid or expired. Request a new link.");
    }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/applicant/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to send login link");
      setMessage("If that email is approved, a secure login link has been sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main data-admin className="min-h-screen">
      <div className="applicant-auth">
        <section className="applicant-auth-brand">
          <div className="brand compact">
            <LogoMark />
            <div>
              <div className="brand-name">Taaruf</div>
              <div className="brand-tag">Applicant</div>
            </div>
          </div>
          <div className="page-head">
            <div>
              <h1>
                Applicant <em>portal</em>
              </h1>
              <p>Enter the email you used for registration.</p>
            </div>
          </div>
          <div className="applicant-auth-note">
            <div className="mono">SECURE LINK</div>
            <p>Approved applicants receive a time-limited login link by email.</p>
          </div>
        </section>

        <section className="panel applicant-auth-panel">
          <div className="panel-head">
            <h3>Login</h3>
          </div>
          <form onSubmit={submit} className="applicant-form">
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            {message && <p className="notice success">{message}</p>}
            {error && <p className="notice error">{error}</p>}
            <button type="submit" className="btn btn-primary full" disabled={isSubmitting}>
              {Ico.inbox}
              <span>{isSubmitting ? "Sending..." : "Send Login Link"}</span>
            </button>
          </form>

          <div className="applicant-auth-foot">
            <p>After logging in, you can update your profile from your applicant dashboard.</p>
            <Link className="btn btn-ghost btn-sm" href="/">
            Back to home
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
