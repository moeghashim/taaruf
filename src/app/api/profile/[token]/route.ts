import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

function getConvexClient() {
  const convexUrl = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    throw new Error("Convex URL not configured");
  }
  return new ConvexHttpClient(convexUrl);
}

export async function GET(_: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const convexClient = getConvexClient();
    const registration = await convexClient.query(api.registrations.getByProfileAccessToken, { token });

    if (!registration) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const imageStorageIds = registration.imageStorageIds || [];
    const imageUrls = imageStorageIds.length
      ? await convexClient.query(api.registrations.getImageUrls, { storageIds: imageStorageIds })
      : [];

    return NextResponse.json({
      registration: {
        name: registration.name,
        gender: registration.gender,
        email: registration.email,
        ethnicity: registration.ethnicity || "",
        imageStorageIds,
        imageUrls: imageUrls
          .map((image) => image.url)
          .filter((url): url is string => Boolean(url)),
        prayerCommitment: registration.prayerCommitment || "",
        hijabResponse: registration.hijabResponse || "",
        spouseRequirement1: registration.spouseRequirement1 || "",
        spouseRequirement2: registration.spouseRequirement2 || "",
        spouseRequirement3: registration.spouseRequirement3 || "",
        shareableBio: registration.shareableBio || "",
        photoSharingPermission: registration.photoSharingPermission || "",
        profileCompletionStatus: registration.profileCompletionStatus || "not_started",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const body = await request.json();
    const convexClient = getConvexClient();

    await convexClient.mutation(api.registrations.updateProfile, {
      token,
      ethnicity: body.ethnicity,
      imageStorageIds: body.imageStorageIds,
      prayerCommitment: body.prayerCommitment,
      hijabResponse: body.hijabResponse,
      spouseRequirement1: body.spouseRequirement1,
      spouseRequirement2: body.spouseRequirement2,
      spouseRequirement3: body.spouseRequirement3,
      shareableBio: body.shareableBio,
      photoSharingPermission: body.photoSharingPermission,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
