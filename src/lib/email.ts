import { Resend } from "resend";

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY!);
  }
  return _resend;
}

const defaultFrom = "1Plus1 Match <contact@1plus1match.com>";

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
      text: `Assalamu Alaikum ${name},\n\nWe hope you are doing well.\n\nWe’re reaching out with a quick reminder to complete your 1 Plus 1 profile update if you have not already done so. At this stage, we are not able to move forward with introductions, match follow-up, or interest review until your profile has been fully updated.\n\nCompleting your profile helps us review compatibility more accurately, follow up on interests more effectively, and support introductions in a more thoughtful and organized way.\n\nWe have also now added a space in the profile update form where you can share any interests from a previous workshop or event. If you have not already submitted your interests to an admin, you can now include them directly in your profile update by providing the participant’s name or number.\n\nPlease complete your profile as soon as possible so we can continue moving your profile forward.\n\nComplete your profile: ${profileUrl}\n\nWarmly,\nBader & Danielle\n1 Plus 1 Leads`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #374151;">
          <h2 style="color: #1f2937;">Assalamu Alaikum ${name},</h2>
          <p style="line-height: 1.6;">
            We hope you are doing well.
          </p>
          <p style="line-height: 1.6;">
            We’re reaching out with a quick reminder to complete your 1 Plus 1 profile update if you have not already done so. At this stage, we are not able to move forward with introductions, match follow-up, or interest review until your profile has been fully updated.
          </p>
          <p style="line-height: 1.6;">
            Completing your profile helps us review compatibility more accurately, follow up on interests more effectively, and support introductions in a more thoughtful and organized way.
          </p>
          <p style="line-height: 1.6;">
            We have also now added a space in the profile update form where you can share any interests from a previous workshop or event.
          </p>
          <p style="line-height: 1.6;">
            If you have not already submitted your interests to an admin, you can now include them directly in your profile update by providing the participant’s name or number.
          </p>
          <p style="margin: 24px 0;">
            <a href="${profileUrl}" style="display: inline-block; background: #0f766e; color: white; text-decoration: none; padding: 12px 18px; border-radius: 8px; font-weight: 600;">
              Complete Your Profile
            </a>
          </p>
          <p style="line-height: 1.6;">
            Please complete your profile as soon as possible so we can continue moving your profile forward.
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
}): Promise<{ success: boolean; error?: string; id?: string }> {
  try {
    const resend = getResend();

    const result = await resend.emails.send({
      from: defaultFrom,
      to: email,
      subject: "A 1 Plus 1 Match Update for You",
      text: `Assalamu Alaikum ${name},\n\nWe wanted to let you know that the 1 Plus 1 team has identified a potential match for you.\n\nWe are reviewing the next steps internally and will reach out again when there is something specific for you to review or respond to.\n\nAt this stage, no action is needed from you.\n\nWarmly,\nBader & Danielle\n1 Plus 1 Leads`,
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

    return { success: true, id: result.data?.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Failed to send match notification email:", message);
    return { success: false, error: message };
  }
}

export async function sendInterestClosedEmail({
  requesterEmail,
  requesterName,
  targetNumber,
}: {
  requesterEmail: string;
  requesterName: string;
  targetNumber: number | null;
}): Promise<{ success: boolean; error?: string; id?: string }> {
  const targetLabel = targetNumber ? `#${targetNumber}` : "that profile";

  try {
    const resend = getResend();

    const result = await resend.emails.send({
      from: defaultFrom,
      to: requesterEmail,
      subject: "A 1 Plus 1 Interest Update",
      text: `Assalamu Alaikum ${requesterName},\n\nYour interest in ${targetLabel} has been closed. You may now express interest in someone else.\n\nWarmly,\nBader & Danielle\n1 Plus 1 Leads`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #374151;">
          <h2 style="color: #1f2937;">Assalamu Alaikum ${requesterName},</h2>
          <p style="line-height: 1.6;">
            Your interest in ${targetLabel} has been closed. You may now express interest in someone else.
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

    return { success: true, id: result.data?.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Failed to send interest closed email:", message);
    return { success: false, error: message };
  }
}
