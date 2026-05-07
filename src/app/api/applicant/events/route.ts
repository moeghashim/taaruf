import { NextRequest, NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import { getApplicantSessionHash } from "@/lib/applicant-session";
import { getConvexClient } from "@/lib/convex";
import { sendEventRegistrationReceivedEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sessionHash = await getApplicantSessionHash();
    if (!sessionHash) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const convex = getConvexClient();
    const events = await convex.query(api.events.getApplicantEvents, { sessionHash });
    return NextResponse.json(events, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionHash = await getApplicantSessionHash();
    if (!sessionHash) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    if (body.action !== "register" || !body.eventId) {
      return NextResponse.json({ error: "eventId is required" }, { status: 400 });
    }

    const convex = getConvexClient();
    const result = await convex.mutation(api.events.registerForEvent, {
      sessionHash,
      eventId: body.eventId,
    });
    const claim = await convex.mutation(api.events.claimRegistrationReceivedEmail, {
      eventRegistrationId: result.eventRegistrationId,
    });

    if (claim.claimed && claim.name && claim.email && claim.eventTitle && claim.registrationStatus) {
      const emailResult = await sendEventRegistrationReceivedEmail({
        name: claim.name,
        email: claim.email,
        eventTitle: claim.eventTitle,
        registrationStatus: claim.registrationStatus,
      });
      if (!emailResult.success) {
        await convex.mutation(api.events.recordRegistrationReceivedEmailFailure, {
          eventRegistrationId: result.eventRegistrationId,
          error: emailResult.error || "Failed to send event registration email",
        });
        return NextResponse.json({
          success: true,
          result,
          notification: { sent: false, error: emailResult.error },
        });
      }
    }

    return NextResponse.json({ success: true, result, notification: { sent: claim.claimed } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 }
    );
  }
}
