import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

export const dynamic = "force-dynamic";

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
    const share = await convexClient.query(api.profileShares.getByShareToken, { shareToken: token });

    if (!share || !share.owner || !share.recipient) {
      return NextResponse.json({ error: "Shared profile not found" }, { status: 404 });
    }

    const imageStorageIds = share.includeImages ? (share.owner.imageStorageIds || []) : [];
    const imageUrls = imageStorageIds.length
      ? await convexClient.query(api.registrations.getImageUrls, { storageIds: imageStorageIds })
      : [];
    const images = imageUrls.flatMap((image) =>
      image.url ? [{ storageId: image.storageId, url: image.url }] : []
    );

    try {
      await convexClient.mutation(api.profileShares.markViewed, { shareToken: token });
    } catch {
      // Ignore view-marking errors for page load
    }

    return NextResponse.json(
      {
        share: {
          includeImages: share.includeImages,
          status: share.status,
          owner: {
            age: share.owner.age,
            gender: share.owner.gender,
            maritalStatus: share.owner.maritalStatus,
            education: share.owner.education,
            job: share.owner.job,
            ethnicity: share.owner.ethnicity || "",
            prayerCommitment: share.owner.prayerCommitment || "",
            hijabResponse: share.owner.hijabResponse || "",
            spouseRequirement1: share.owner.spouseRequirement1 || "",
            spouseRequirement2: share.owner.spouseRequirement2 || "",
            spouseRequirement3: share.owner.spouseRequirement3 || "",
            shareableBio: share.owner.shareableBio || "",
            photoSharingPermission: share.owner.photoSharingPermission || "",
            imageUrls: images.map((image) => image.url),
            images,
          },
          recipient: {
            name: share.recipient.name,
          },
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
