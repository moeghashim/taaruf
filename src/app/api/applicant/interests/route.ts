import { NextRequest, NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import { getApplicantSessionHash } from "@/lib/applicant-session";
import { getConvexClient } from "@/lib/convex";
import { sendContactSharedEmail, sendFinalApprovalRequestedEmail, sendInboundInterestReceivedEmail } from "@/lib/email";

function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
}

export async function POST(request: NextRequest) {
  try {
    const sessionHash = await getApplicantSessionHash();
    if (!sessionHash) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const convex = getConvexClient();

    if (body.action === "submit_number") {
      if (!Number.isInteger(body.applicantNumber) || body.applicantNumber <= 0) {
        return NextResponse.json({ error: "A valid applicant number is required" }, { status: 400 });
      }
      const result = await convex.mutation(api.applicantInterests.submitInterestNumber, {
        sessionHash,
        applicantNumber: body.applicantNumber,
      });

      if (result.inboundInterestNotification) {
        const appUrl = getAppUrl();
        if (!appUrl) {
          const error = "App URL not configured";
          await convex.mutation(api.applicantInterests.recordInboundInterestNotificationFailure, {
            interestId: result.inboundInterestNotification.interestId,
            error,
          });
          return NextResponse.json({
            success: true,
            result,
            message: "Interest submitted, but the recipient notification email could not be sent.",
            notification: { sent: false, error },
          });
        }

        const emailResult = await sendInboundInterestReceivedEmail({
          name: result.inboundInterestNotification.name,
          email: result.inboundInterestNotification.email,
          applicantPortalUrl: `${appUrl}/me`,
        });

        if (!emailResult.success) {
          await convex.mutation(api.applicantInterests.recordInboundInterestNotificationFailure, {
            interestId: result.inboundInterestNotification.interestId,
            error: emailResult.error || "Failed to send inbound interest email",
          });
          return NextResponse.json({
            success: true,
            result,
            message: "Interest submitted, but the recipient notification email could not be sent.",
            notification: { sent: false, error: emailResult.error || "Failed to send inbound interest email" },
          });
        }

        return NextResponse.json({
          success: true,
          result,
          message: "Interest submitted. The recipient has been notified.",
          notification: { sent: true, providerId: emailResult.id },
        });
      }

      return NextResponse.json({ success: true, result });
    }

    if (body.action === "respond") {
      if (!body.interestId || !["accept", "decline", "keep_open"].includes(body.decision)) {
        return NextResponse.json({ error: "interestId and valid decision are required" }, { status: 400 });
      }
      await convex.mutation(api.applicantInterests.respondToInbound, {
        sessionHash,
        interestId: body.interestId,
        decision: body.decision,
      });
      return NextResponse.json({ success: true });
    }

    if (body.action === "final_approval") {
      if (!body.interestId || typeof body.approved !== "boolean") {
        return NextResponse.json({ error: "interestId and approved are required" }, { status: 400 });
      }
      const result = await convex.mutation(api.applicantInterests.giveFinalApproval, {
        sessionHash,
        interestId: body.interestId,
        approved: body.approved,
      });

      if (result.finalApprovalNotification) {
        const appUrl = getAppUrl();
        if (!appUrl) {
          const error = "App URL not configured";
          await convex.mutation(api.applicantInterests.recordFinalApprovalNotificationFailure, {
            interestId: body.interestId,
            error,
          });
          return NextResponse.json({
            success: true,
            message: "Approval recorded, but the notification email could not be sent.",
            notification: { sent: false, error },
          });
        }

        const emailResult = await sendFinalApprovalRequestedEmail({
          name: result.finalApprovalNotification.name,
          email: result.finalApprovalNotification.email,
          applicantPortalUrl: `${appUrl}/me`,
        });

        if (!emailResult.success) {
          await convex.mutation(api.applicantInterests.recordFinalApprovalNotificationFailure, {
            interestId: body.interestId,
            error: emailResult.error || "Failed to send final approval requested email",
          });
          return NextResponse.json({
            success: true,
            message: "Approval recorded, but the notification email could not be sent.",
            notification: { sent: false, error: emailResult.error || "Failed to send final approval requested email" },
          });
        }

        return NextResponse.json({
          success: true,
          message: "Approval recorded. The other applicant has been notified.",
          notification: { sent: true, providerId: emailResult.id },
        });
      }

      if (result.contactSharedNotification?.recipients.length) {
        const appUrl = getAppUrl();
        if (!appUrl) {
          const error = "App URL not configured";
          await convex.mutation(api.matches.markContactSharedNotificationSent, {
            id: result.contactSharedNotification.matchId,
            sent: false,
            error,
          });
          return NextResponse.json({
            success: true,
            message: "Contact information is shared, but the notification email could not be sent.",
            notification: { sent: false, error },
          });
        }

        const emailResults = await Promise.all(
          result.contactSharedNotification.recipients.map(async (recipient) => ({
            recipient,
            result: await sendContactSharedEmail({
              name: recipient.name,
              email: recipient.email,
              applicantPortalUrl: `${appUrl}/me`,
            }),
          }))
        );
        const failures = emailResults.filter((item) => !item.result.success);
        const success = failures.length === 0;
        await convex.mutation(api.matches.markContactSharedNotificationSent, {
          id: result.contactSharedNotification.matchId,
          sent: success,
          error: success
            ? undefined
            : failures.map((item) => `${item.recipient.email}: ${item.result.error}`).join(" | "),
        });

        return NextResponse.json({
          success: true,
          message: success
            ? "Contact information is shared. Both applicants have been notified."
            : "Contact information is shared, but one or more notification emails failed.",
          notification: {
            sent: success,
            requested: emailResults.length,
            failed: failures.length,
          },
        });
      }

      return NextResponse.json({ success: true, message: "Approval recorded." });
    }

    if (body.action === "withdraw") {
      if (!body.interestId) {
        return NextResponse.json({ error: "interestId is required" }, { status: 400 });
      }
      await convex.mutation(api.applicantInterests.withdrawOutbound, {
        sessionHash,
        interestId: body.interestId,
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 }
    );
  }
}
