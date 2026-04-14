import { Resend } from "resend";

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY!);
  }
  return _resend;
}

const defaultFrom = process.env.RESEND_FROM_EMAIL || "1Plus1 Taaruf <bader@taarufusa.com>";

export async function sendConfirmationEmail({
  name,
  email,
}: {
  name: string;
  email: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const resend = getResend();

    const result = await resend.emails.send({
      from: defaultFrom,
      to: email,
      subject: "Registration Confirmed - 1Plus1 Pre-Marriage Workshop",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1f2937;">Assalamu Alaikum ${name},</h2>

          <p style="color: #374151; line-height: 1.6;">
            Thank you for registering for the <strong>1Plus1 Pre-Marriage Workshop</strong> on <strong>April 12, 3:00 - 5:30 PM</strong>.
          </p>

          <p style="color: #374151; line-height: 1.6;">
            Your payment has been received and your registration is confirmed. Our team will review your profile and you will be contacted with further details about the event.
          </p>

          <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 24px 0;">
            <p style="color: #166534; margin: 0; font-weight: 600;">What happens next:</p>
            <ul style="color: #166534; margin: 8px 0 0 0; padding-left: 20px; line-height: 1.8;">
              <li>Our team will review your registration</li>
              <li>You will receive event details closer to the date</li>
              <li>Feel free to reach out if you have any questions</li>
            </ul>
          </div>

          <p style="color: #374151; line-height: 1.6;">
            We look forward to seeing you at the workshop!
          </p>

          <p style="color: #374151; line-height: 1.6;">
            JazakAllahu Khairan,<br/>
            <strong>The 1Plus1 Team</strong>
          </p>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="color: #9ca3af; font-size: 12px;">
            This email was sent to ${email} because you registered for a 1Plus1 event.
          </p>
        </div>
      `,
    });

    if (result.error) {
      return { success: false, error: result.error.message };
    }

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Failed to send confirmation email:", message);
    return { success: false, error: message };
  }
}

export async function sendProfileCompletionEmail({
  name,
  email,
  profileUrl,
}: {
  name: string;
  email: string;
  profileUrl: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const resend = getResend();

    const result = await resend.emails.send({
      from: defaultFrom,
      to: email,
      subject: "Please Complete Your 1 Plus 1 Profile",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #374151;">
          <h2 style="color: #1f2937;">Assalamu Alaikum ${name},</h2>
          <p style="line-height: 1.6;">
            As part of improving the 1 Plus 1 participant profile process, we’re asking you to complete a few additional profile details so we can better support thoughtful and appropriate matches.
          </p>
          <p style="line-height: 1.6;">
            Please use the secure link below to update your profile:
          </p>
          <p style="margin: 24px 0;">
            <a href="${profileUrl}" style="display: inline-block; background: #0f766e; color: white; text-decoration: none; padding: 12px 18px; border-radius: 8px; font-weight: 600;">
              Complete Your Profile
            </a>
          </p>
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 24px 0;">
            <p style="margin: 0 0 8px; font-weight: 600; color: #0f172a;">This update will let you add:</p>
            <ul style="margin: 0; padding-left: 20px; line-height: 1.8;">
              <li>ethnicity</li>
              <li>profile photo(s)</li>
              <li>prayer commitment</li>
              <li>hijab preference or practice</li>
              <li>top spouse requirements</li>
              <li>a shareable bio</li>
            </ul>
          </div>
          <p style="line-height: 1.6;">
            Your photo will not be shared with anyone without your permission.
          </p>
          <p style="line-height: 1.6;">
            We’d appreciate it if you could complete your profile as soon as possible.
          </p>
          <p style="line-height: 1.6;">
            If you have any questions, feel free to reply to this email.
          </p>
          <p style="line-height: 1.6; margin-top: 24px;">
            Warmly,<br />
            <strong>Bader & Danielle</strong><br />
            <strong>1 Plus 1 Leads</strong>
          </p>
          <p style="color: #6b7280; line-height: 1.6; font-size: 14px; margin-top: 24px;">
            If the button above does not work, copy and paste this link into your browser:<br />
            <span style="word-break: break-all;">${profileUrl}</span>
          </p>
        </div>
      `,
    });

    if (result.error) {
      return { success: false, error: result.error.message };
    }

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Failed to send profile completion email:", message);
    return { success: false, error: message };
  }
}

export async function sendMatchNotificationEmail({
  name,
  email,
}: {
  name: string;
  email: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const resend = getResend();

    const result = await resend.emails.send({
      from: defaultFrom,
      to: email,
      subject: "A 1 Plus 1 Match Update for You",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #374151;">
          <h2 style="color: #1f2937;">Assalamu Alaikum ${name},</h2>
          <p style="line-height: 1.6;">
            We wanted to let you know that the 1 Plus 1 team has identified a potential match for you.
          </p>
          <p style="line-height: 1.6;">
            We are reviewing the next steps internally and will reach out again when there is something specific for you to review or respond to.
          </p>
          <p style="line-height: 1.6;">
            At this stage, no action is needed from you.
          </p>
          <p style="line-height: 1.6; margin-top: 24px;">
            Warmly,<br />
            <strong>Bader & Danielle</strong><br />
            <strong>1 Plus 1 Leads</strong>
          </p>
        </div>
      `,
    });

    if (result.error) {
      return { success: false, error: result.error.message };
    }

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Failed to send match notification email:", message);
    return { success: false, error: message };
  }
}
