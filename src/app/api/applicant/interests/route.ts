import { NextRequest, NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import { getApplicantSessionHash } from "@/lib/applicant-session";
import { getConvexClient } from "@/lib/convex";

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
      await convex.mutation(api.applicantInterests.giveFinalApproval, {
        sessionHash,
        interestId: body.interestId,
        approved: body.approved,
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

