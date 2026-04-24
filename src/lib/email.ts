import { Resend } from "resend";

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

export async function sendConfirmationEmail({
  name,
  email,
}: {
  name: string;
  email: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const resend = getResend();

    await resend.emails.send({
      from: "1Plus1 Taaruf <bader@taarufusa.com>",
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

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Failed to send confirmation email:", message);
    return { success: false, error: message };
  }
}
