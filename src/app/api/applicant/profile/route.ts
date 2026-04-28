import { NextRequest, NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import { getApplicantSessionHash } from "@/lib/applicant-session";
import { getConvexClient } from "@/lib/convex";

export async function GET() {
  try {
    const sessionHash = await getApplicantSessionHash();
    if (!sessionHash) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const convex = getConvexClient();
    const profile = await convex.query(api.applicantProfile.getProfile, { sessionHash });
    await convex.mutation(api.applicantAuth.touchSession, { sessionHash });

    return NextResponse.json(profile);
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

    await convex.mutation(api.applicantProfile.updateProfile, {
      sessionHash,
      ethnicity: body.ethnicity,
      imageStorageIds: body.imageStorageIds,
      prayerCommitment: body.prayerCommitment,
      hijabResponse: body.hijabResponse,
      spouseRequirement1: body.spouseRequirement1,
      spouseRequirement2: body.spouseRequirement2,
      spouseRequirement3: body.spouseRequirement3,
      shareableBio: body.shareableBio,
      photoSharingPermission: body.photoSharingPermission,
      interestSubmission: body.interestSubmission,
      interestSubmissionNumbers: body.interestSubmissionNumbers,
      applicantNotesToAdmin: body.applicantNotesToAdmin,
    });
    await convex.mutation(api.applicantAuth.touchSession, { sessionHash });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 }
    );
  }
}
