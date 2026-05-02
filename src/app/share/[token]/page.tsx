"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { LogoMark } from "@/components/admin/primitives/logo-mark";
import { FactList, type Fact } from "@/components/admin/primitives/fact-list";

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
  if (!value) return "—";
  return value.replace(/_/g, " ");
}

function ShareShell({ children }: { children: React.ReactNode }) {
  return (
    <main data-admin className="min-h-screen">
      <div className="applicant-share">
        <header className="applicant-share-head">
          <div className="brand compact">
            <LogoMark />
            <div>
              <div className="brand-name">Taaruf</div>
              <div className="brand-tag">Shared Profile</div>
            </div>
          </div>
        </header>
        {children}
      </div>
    </main>
  );
}

export default function SharedProfilePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
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
    return (
      <ShareShell>
        <section className="panel applicant-share-message">
          <p className="notice error">{error}</p>
        </section>
      </ShareShell>
    );
  }

  if (!data) {
    return (
      <ShareShell>
        <section className="panel applicant-share-message">
          <div className="coming-soon compact">
            <div className="lede">Loading shared profile...</div>
          </div>
        </section>
      </ShareShell>
    );
  }

  const { owner, recipient, includeImages } = data.share;

  const facts: Fact[] = [
    { label: "Age", value: owner.age },
    { label: "Gender", value: titleizeValue(owner.gender) },
    { label: "Marital", value: titleizeValue(owner.maritalStatus) },
    { label: "Education", value: titleizeValue(owner.education) },
    { label: "Job", value: owner.job || "—" },
    { label: "Ethnicity", value: owner.ethnicity || "—" },
    { label: "Prayer", value: titleizeValue(owner.prayerCommitment) },
    { label: "Hijab", value: titleizeValue(owner.hijabResponse) },
    { label: "Photo permission", value: titleizeValue(owner.photoSharingPermission) },
  ];

  return (
    <ShareShell>
      <div className="page-head">
        <div>
          <h1>
            Shared <em>profile</em>
          </h1>
          <p>This profile has been shared for {recipient.name} to review.</p>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h3>Details</h3>
            <p>About this applicant.</p>
          </div>
        </div>
        <div className="applicant-share-section">
          <FactList facts={facts} />
        </div>
      </section>

      {includeImages && owner.imageUrls.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>Photos</h3>
            </div>
          </div>
          <div className="applicant-share-section">
            <div className="photo-grid">
              {owner.imageUrls.map((imageUrl, index) => (
                <div key={`${imageUrl}-${index}`} className="photo-card">
                  <Image
                    src={imageUrl}
                    alt={`Profile image ${index + 1}`}
                    width={320}
                    height={128}
                    unoptimized
                  />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <div>
            <h3>Top spouse requirements</h3>
          </div>
        </div>
        <div className="applicant-share-section">
          <ol className="applicant-share-requirements">
            <li>
              <span className="rank">01</span>
              <span>{owner.spouseRequirement1 || "—"}</span>
            </li>
            <li>
              <span className="rank">02</span>
              <span>{owner.spouseRequirement2 || "—"}</span>
            </li>
            <li>
              <span className="rank">03</span>
              <span>{owner.spouseRequirement3 || "—"}</span>
            </li>
          </ol>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h3>Bio</h3>
          </div>
        </div>
        <div className="applicant-share-section">
          <div className="bio-box">
            <p>{owner.shareableBio || "—"}</p>
          </div>
        </div>
      </section>
    </ShareShell>
  );
}
