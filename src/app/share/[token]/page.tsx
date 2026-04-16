"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";

type SharedProfileResponse = {
  share: {
    includeImages: boolean;
    status: string;
    owner: {
      age: number;
      gender: string;
      maritalStatus: string;
      education: string;
      job: string;
      ethnicity: string;
      prayerCommitment: string;
      hijabResponse: string;
      spouseRequirement1: string;
      spouseRequirement2: string;
      spouseRequirement3: string;
      shareableBio: string;
      photoSharingPermission: string;
      imageUrls: string[];
    };
    recipient: {
      name: string;
    };
  };
};

function titleizeValue(value?: string) {
  if (!value) return "-";
  return value.replace(/_/g, " ");
}

export default function SharedProfilePage({ params }: { params: Promise<{ token: string }> }) {
  const [data, setData] = useState<SharedProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const { token } = await params;
        const response = await fetch(`/api/share/${token}`);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Failed to load shared profile");
        }
        setData(payload);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }

    void load();
  }, [params]);

  if (error) {
    return <main className="min-h-screen bg-slate-50 px-4 py-10"><Card className="mx-auto max-w-3xl p-8 text-red-600">{error}</Card></main>;
  }

  if (!data) {
    return <main className="min-h-screen bg-slate-50 px-4 py-10"><Card className="mx-auto max-w-3xl p-8">Loading shared profile...</Card></main>;
  }

  const { owner, recipient, includeImages } = data.share;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-semibold text-slate-900">Shared Profile</h1>
          <p className="text-sm text-slate-600">This profile has been shared for {recipient.name} to review.</p>
        </div>

        <Card className="p-8 space-y-6">
          <div className="grid gap-4 md:grid-cols-2 text-sm">
            <div><strong>Age:</strong> {owner.age}</div>
            <div><strong>Gender:</strong> {owner.gender}</div>
            <div><strong>Marital status:</strong> {owner.maritalStatus}</div>
            <div><strong>Education:</strong> {owner.education}</div>
            <div><strong>Job:</strong> {owner.job}</div>
            <div><strong>Ethnicity:</strong> {owner.ethnicity || "-"}</div>
            <div><strong>Prayer:</strong> {titleizeValue(owner.prayerCommitment)}</div>
            <div><strong>Hijab:</strong> {titleizeValue(owner.hijabResponse)}</div>
            <div><strong>Photo permission:</strong> {titleizeValue(owner.photoSharingPermission)}</div>
          </div>

          {includeImages && owner.imageUrls.length > 0 && (
            <div className="space-y-2">
              <h2 className="font-semibold text-slate-900">Photos</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {owner.imageUrls.map((imageUrl, index) => (
                  <img key={`${imageUrl}-${index}`} src={imageUrl} alt={`Profile image ${index + 1}`} className="h-32 w-full rounded-lg object-cover border border-slate-200" />
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-3 text-sm">
            <div><strong>Requirement 1:</strong> {owner.spouseRequirement1 || "-"}</div>
            <div><strong>Requirement 2:</strong> {owner.spouseRequirement2 || "-"}</div>
            <div><strong>Requirement 3:</strong> {owner.spouseRequirement3 || "-"}</div>
          </div>

          <div className="space-y-2 text-sm">
            <h2 className="font-semibold text-slate-900">Basic bio</h2>
            <p className="whitespace-pre-wrap text-slate-700">{owner.shareableBio || "-"}</p>
          </div>
        </Card>
      </div>
    </main>
  );
}
