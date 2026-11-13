import { ACTIVE_MATCH_CONFLICT_MESSAGE, isApplicantActiveMatchConflict } from "@/lib/applicant-match-conflict";
import { isApplicantUnauthorized } from "@/lib/applicant-auth-error";
import { getAdminSecret } from "@/lib/admin-server";
import { NextRequest, NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import { getApplicantSessionHash } from "@/lib/applicant-session";
import { getConvexClient } from "@/lib/convex";
import { sendFinalApprovalRequestedEmail, sendInboundInterestReceivedEmail } from "@/lib/email";

function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
}

function rawErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function applicantInterestErrorResponse(error: unknown) {
  if (isApplicantActiveMatchConflict(error)) return NextResponse.json({ error: ACTIVE_MATCH_CONFLICT_MESSAGE }, { status: 409 });
  const message = rawErrorMessage(error);
  if (/interest submissions|submission event|approved and have attended|expectedEventId/i.test(message)) {
    return NextResponse.json({ error: "Interest availability has changed. Submissions require an enabled event and approved, confirmed, checked-in attendance. Please check the updated availability and try again." }, { status: 409 });
  }
  if (/archived|not active/i.test(message)) return NextResponse.json({ success: false, skipped: "ineligible", error: "Matching activity stopped because the connection is no longer eligible." }, { status: 409 });
  if (message.includes("Pause unavailable until contact release")) return NextResponse.json({ error: "Pause unavailable until contact release" }, { status: 409 });
  for (const safeMessage of ["Applicant details could not be verified", "You can submit a maximum of 3 interests per event", "Interest already submitted for this event"]) {
    if (message.includes(safeMessage)) return NextResponse.json({ error: safeMessage }, { status: 400 });
  }

  if (message.includes("Applicant must have attended an event within the active interest window")) {
    return NextResponse.json(
      {
        error:
          "Interest submissions are open only for applicants who attended a recent event. Please contact the team if this looks wrong.",
      },
      { status: 400 }
    );
  }

  if (message.includes("Applicant number not found")) {
    return NextResponse.json(
      { error: "We could not find that applicant number. Please check the number and try again." },
      { status: 400 }
    );
  }

  if (message.includes("Applicant cannot express interest in themselves")) {
    return NextResponse.json(
      { error: "Please enter another applicant's number." },
      { status: 400 }
    );
  }

  if (message.includes("Interest must be between opposite-gender applicants")) {
    return NextResponse.json(
      { error: "Please enter an approved opposite-gender applicant number." },
      { status: 400 }
    );
  }

  if (message.includes("An open interest already exists")) {
    return NextResponse.json(
      { error: "You already have an open interest for this applicant." },
      { status: 400 }
    );
  }

  if (message.includes("Your registration must be approved before you can express or respond to interests.")) {
    return NextResponse.json(
      { error: "Your registration needs to be approved before you can submit or respond to interests." },
      { status: 400 }
    );
  }

  if (message.includes("Your registration must be pending or approved before you can express interest.")) {
    return NextResponse.json(
      { error: "Your registration needs to be pending or approved before you can submit interests." },
      { status: 400 }
    );
  }

  if (isApplicantUnauthorized(error)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.error("Applicant interest action failed");
  return NextResponse.json(
    { error: "Something went wrong while updating your interest. Please try again, or contact the team if it keeps happening." },
    { status: 500 }
  );
}

export async function POST(request: NextRequest) {
  try {
    const sessionHash = await getApplicantSessionHash();
    if (!sessionHash) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    const convex = getConvexClient();

    if (["pause_connection", "resume_connection"].includes(body.action)) {
      if (typeof body.interestId !== "string" || !body.interestId) return NextResponse.json({ error: "interestId is required" }, { status: 400 });
      await convex.mutation(api.matches.setPausedForApplicant, { sessionHash, interestId: body.interestId, paused: body.action === "pause_connection" });
      return NextResponse.json({ success: true });
    }

    if (body.action === "revoke_photos") {
      if (typeof body.interestId !== "string" || !body.interestId) return NextResponse.json({ error: "interestId is required" }, { status: 400 });
      await convex.mutation(api.applicantInterests.revokeSenderPhotoConsent, { sessionHash, interestId: body.interestId });
      return NextResponse.json({ success: true, message: "Photo sharing revoked for this interest. Previously obtained photos or links cannot be recalled." });
    }

    if (body.action === "lookup_name") {
      if (!Number.isSafeInteger(body.applicantNumber) || body.applicantNumber <= 0 || typeof body.expectedEventId !== "string") return NextResponse.json({ firstName: null }, { status: 400 });
      const result = await convex.mutation(api.applicantInterests.lookupInterestName, { sessionHash, applicantNumber: body.applicantNumber, expectedEventId: body.expectedEventId });
      return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action === "submit_number") {
      if (body.photoConsent !== undefined && !["yes", "no"].includes(body.photoConsent)) return NextResponse.json({ error: "Invalid legacy photo choice" }, { status: 400 });
      if (!Number.isInteger(body.applicantNumber) || body.applicantNumber <= 0) {
        return NextResponse.json({ error: "A valid applicant number is required" }, { status: 400 });
      }
      if (typeof body.expectedEventId !== "string" || !body.expectedEventId.trim()) {
        return NextResponse.json({ error: "Refresh interest availability before submitting." }, { status: 400 });
      }
      const result = await convex.mutation(api.applicantInterests.submitInterestNumber, {
        expectedEventId: body.expectedEventId,
        ...(body.photoConsent !== undefined ? { photoConsent: body.photoConsent } : {}),
        sessionHash,
        applicantNumber: body.applicantNumber,

      });

      if ("existingInbound" in result && result.existingInbound) {
        return NextResponse.json({ success: true, existingInbound: result.existingInbound, message: "You already have an incoming interest from this applicant. Review the existing interest before submitting another." });
      }

      if (result.inboundInterestNotification) {
        // Submission has committed. Explicit sharing can retire this ID before
        // notification work starts. Keep the saved receipt; never bypass guards.
        try {
          const appUrl = getAppUrl();
          if (!appUrl) throw new Error("App URL not configured");
          const recipient = await convex.query(api.applicantInterests.getNotificationRecipient, { adminSecret: getAdminSecret(), sessionHash, interestId: result.interestId, kind: "inbound" });
          await convex.mutation(api.interests.assertNotificationEligible, { id: result.inboundInterestNotification.interestId, adminSecret: getAdminSecret() });
          const emailResult = await sendInboundInterestReceivedEmail({
            name: recipient.name,
            email: recipient.email,
            applicantPortalUrl: appUrl + "/me?connection=" + encodeURIComponent(result.interestId),
          });
          if (!emailResult.success) throw new Error(emailResult.error || "Failed to send inbound interest email");
          return NextResponse.json({
            success: true,
            result: { interestId: result.interestId, private: result.private },
            message: "Interest submitted. The recipient has been notified.",
            notification: { sent: true, providerId: emailResult.id },
          });
        } catch {
          // Best-effort release of the optimistic claim. Alias audit is immutable,
          // so failure-recording rejection cannot invalidate the committed receipt.
          const error = "Recipient notification could not be sent.";
          try {
            await convex.mutation(api.applicantInterests.recordInboundInterestNotificationFailure, {
              adminSecret: getAdminSecret(), interestId: result.inboundInterestNotification.interestId, error,
            });
          } catch {
            console.error("Saved interest notification failure could not be recorded");
          }
          return NextResponse.json({
            success: true,
            result: { interestId: result.interestId, private: result.private },
            message: "Interest submitted, but the recipient notification email could not be sent.",
            notification: { sent: false, error },
          });
        }
      }

      return NextResponse.json({ success: true, result: { interestId: result.interestId, private: result.private } });
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
        adminSecret: getAdminSecret(),
        sessionHash,
        interestId: body.interestId,
        approved: body.approved,
      });

      if (result.finalApprovalNotification) {
        let recipient: { name: string; email: string };
        const appUrl = getAppUrl();
        if (!appUrl) {
          const error = "App URL not configured";
          await convex.mutation(api.applicantInterests.recordFinalApprovalNotificationFailure, { adminSecret: getAdminSecret(),
            interestId: body.interestId,
            error,
          });
          return NextResponse.json({
            success: true,
            message: "Your decision has been recorded.",
          });
        }

        try {
          recipient = await convex.query(api.applicantInterests.getNotificationRecipient, { adminSecret: getAdminSecret(), sessionHash, interestId: body.interestId, kind: "final_approval" });
          await convex.mutation(api.interests.assertNotificationEligible, { id: body.interestId, adminSecret: getAdminSecret() });
        } catch (error) {
          // The claim is optimistic: suppression must release its sent marker.
          await convex.mutation(api.applicantInterests.recordFinalApprovalNotificationFailure, { adminSecret: getAdminSecret(),
            interestId: body.interestId,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
        const emailResult = await sendFinalApprovalRequestedEmail({
          name: recipient.name,
          email: recipient.email,
          applicantPortalUrl: `${appUrl}/me?connection=${encodeURIComponent(body.interestId)}`,
        });

        if (!emailResult.success) {
          await convex.mutation(api.applicantInterests.recordFinalApprovalNotificationFailure, { adminSecret: getAdminSecret(),
            interestId: body.interestId,
            error: emailResult.error || "Failed to send final approval requested email",
          });
          return NextResponse.json({
            success: true,
            message: "Your decision has been recorded.",
          });
        }

        return NextResponse.json({
          success: true,
          message: "Your decision has been recorded.",
        });
      }

      return NextResponse.json({ success: true, message: "Your decision has been recorded." });
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

    if (body.action === "close_connection") {
      if (!body.interestId) {
        return NextResponse.json({ error: "interestId is required" }, { status: 400 });
      }
      await convex.mutation(api.applicantInterests.closeConnection, {
        sessionHash,
        interestId: body.interestId,
      });
      return NextResponse.json({ success: true, message: "Connection closed. The profile has been removed." });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return applicantInterestErrorResponse(error);
  }
}
