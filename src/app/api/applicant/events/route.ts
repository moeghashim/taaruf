import { NextRequest, NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import { getApplicantSessionHash } from "@/lib/applicant-session";
import { getConvexClient } from "@/lib/convex";
import { sendEventReceipt } from "@/lib/event-registration-receipt";

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
    const convex = getConvexClient();
    if (body.action === "confirm") {
      if (!body.eventRegistrationId) {
        return NextResponse.json({ error: "eventRegistrationId is required" }, { status: 400 });
      }
      const eventRegistrationId = await convex.mutation(api.events.confirmParticipation, {
        sessionHash,
        eventRegistrationId: body.eventRegistrationId,
      });
      return NextResponse.json({ success: true, result: { eventRegistrationId } });
    }

    if (body.action !== "register" || !body.eventId) {
      return NextResponse.json({ error: "eventId is required" }, { status: 400 });
    }

    const result = await convex.mutation(api.events.registerForEvent, {
      sessionHash,
      eventId: body.eventId,
    });
    const notification = await sendEventReceipt(convex, result.eventRegistrationId);
    return NextResponse.json({ success: true, result, notification });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 }
    );
  }
}
