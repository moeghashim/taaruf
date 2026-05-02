import { Resend } from "resend";
import { ConvexHttpClient } from "convex/browser";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const envPath = path.resolve(process.cwd(), ".env.prod");
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}

const targetEmail = process.argv[2];
if (!targetEmail) {
  console.error("usage: node scripts/send-welcome-test.mjs <email>");
  process.exit(1);
}

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);
const all = await convex.query("registrations:getAll", {});
const registration = all.find(
  (r) => (r.email || "").trim().toLowerCase() === targetEmail.trim().toLowerCase()
);
if (!registration) {
  console.error(`No registration found for ${targetEmail}`);
  process.exit(1);
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const rawToken = crypto.randomBytes(32).toString("base64url");
const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
const created = await convex.mutation("applicantAuth:createLoginToken", {
  email: registration.email,
  tokenHash,
  expiresInMs: SEVEN_DAYS_MS,
});
if (!created) {
  console.error(`createLoginToken returned null for ${targetEmail}`);
  process.exit(1);
}

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.taarufusa.com";
const profileUrl = `${appUrl}/api/applicant/login/verify?token=${encodeURIComponent(rawToken)}`;
const name = registration.name;

const resend = new Resend(process.env.RESEND_API_KEY);
const result = await resend.emails.send({
  from: "1Plus1 Match <contact@1plus1match.com>",
  to: targetEmail,
  subject: "Welcome to 1Plus1 — please update your profile",
  text: `Assalamu Alaikum ${name},\n\nWelcome to the 1Plus1 matching program. Your registration has been received and your payment processed.\n\nThe next step is to complete your profile so our team can review it and begin supporting introductions for you.\n\nComplete your profile: ${profileUrl}\n\nWarmly,\nBader & Danielle\n1 Plus 1 Leads`,
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #374151;">
      <h2 style="color: #1f2937;">Assalamu Alaikum ${name},</h2>

      <p style="line-height: 1.6;">
        Welcome to the <strong>1Plus1 matching program</strong>. Your registration has been received and your payment processed.
      </p>

      <p style="line-height: 1.6;">
        The next step is to complete your profile so our team can review it and begin supporting introductions for you.
      </p>

      <p style="margin: 24px 0;">
        <a href="${profileUrl}" style="display: inline-block; background: #0f766e; color: white; text-decoration: none; padding: 12px 18px; border-radius: 8px; font-weight: 600;">
          Complete Your Profile
        </a>
      </p>

      <p style="line-height: 1.6; margin-top: 24px;">
        Warmly,<br />
        <strong>Bader &amp; Danielle</strong><br />
        <strong>1 Plus 1 Leads</strong>
      </p>

      <p style="color: #6b7280; line-height: 1.6; font-size: 14px; margin-top: 24px;">
        If the button above does not work, copy and paste this link into your browser:<br />
        <span style="word-break: break-all;">${profileUrl}</span>
      </p>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      <p style="color: #9ca3af; font-size: 12px;">
        This email was sent to ${targetEmail} because you registered for the 1Plus1 matching program.
      </p>
    </div>
  `,
});

if (result.error) {
  console.error("Resend error:", result.error);
  process.exit(1);
}
console.log("Sent. Resend id:", result.data?.id);
console.log("Login URL (7-day TTL):", profileUrl);
