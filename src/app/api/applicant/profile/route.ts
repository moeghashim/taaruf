import { dateOfBirthError } from "@/lib/date-of-birth";
import { isApplicantUnauthorized } from "@/lib/applicant-auth-error";
import { getAdminSecret } from "@/lib/admin-server";
import { NextRequest, NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import { getApplicantSessionHash } from "@/lib/applicant-session";
import { getConvexClient } from "@/lib/convex";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sessionHash = await getApplicantSessionHash();
    if (!sessionHash) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const convex = getConvexClient();
    const profile = await convex.query(api.applicantProfile.getProfile, { sessionHash });
    await convex.mutation(api.applicantAuth.touchSession, { adminSecret: getAdminSecret(),  sessionHash });

    return NextResponse.json(profile, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: "Unable to complete request" },
      { status: isApplicantUnauthorized(error) ? 401 : 500 }
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
    if (body.dateOfBirth !== undefined && dateOfBirthError(body.dateOfBirth)) {
      return NextResponse.json({ error: "Enter a valid date of birth (age 18–99)." }, { status: 400 });
    }
    const convex = getConvexClient();

    await convex.mutation(api.applicantProfile.updateProfile, {
      sessionHash,
      education: body.education,
      ...(body.dateOfBirth !== undefined ? { dateOfBirth: body.dateOfBirth } : {}),
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
    await convex.mutation(api.applicantAuth.touchSession, { adminSecret: getAdminSecret(),  sessionHash });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Unable to complete request" },
      { status: isApplicantUnauthorized(error) ? 401 : 500 }
    );
  }
}
