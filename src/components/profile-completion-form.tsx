"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { prepareImageFileForUpload } from "@/lib/image-upload";

type PrayerCommitment = "sometimes" | "strive_five" | "always_five" | "five_and_sunnah" | "";
type HijabResponse = "yes" | "no" | "open" | "";
type PhotoSharingPermission = "yes" | "no" | "ask_me_first" | "";

interface UploadedImage {
  storageId: string;
  url: string;
  name: string;
}

interface ProfileData {
  name: string;
  gender: "male" | "female";
  email: string;
  ethnicity: string;
  imageStorageIds: string[];
  imageUrls: string[];
  prayerCommitment: PrayerCommitment;
  hijabResponse: HijabResponse;
  spouseRequirement1: string;
  spouseRequirement2: string;
  spouseRequirement3: string;
  shareableBio: string;
  photoSharingPermission: PhotoSharingPermission;
  interestSubmission: string;
  interestSubmissionNumbers: string[];
  applicantNotesToAdmin: string;
  profileCompletionStatus: string;
}

const prayerOptions = [
  { value: "sometimes", label: "I pray sometimes" },
  { value: "strive_five", label: "I strive to pray 5 times a day but sometimes miss" },
  { value: "always_five", label: "I always pray 5 times a day" },
  { value: "five_and_sunnah", label: "I pray 5 times a day and strive to also pray sunnah" },
] as const;

const yesNoOpenOptions = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "open", label: "Open" },
] as const;

const photoSharingOptions = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "ask_me_first", label: "Ask me first" },
] as const;

export function ProfileCompletionForm({ token }: { token: string }) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const generateUploadUrl = useMutation(api.registrations.generateImageUploadUrl);

  useEffect(() => {
    async function loadProfile() {
      try {
        const response = await fetch(`/api/profile/${token}`);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Failed to load profile");
        }
        setProfile({
          ...data.registration,
          interestSubmissionNumbers: ((data.registration.interestSubmissionNumbers || []) as Array<string | number>).map((value) => String(value)),
        });
        setUploadedImages(
          ((data.registration.imageStorageIds || []) as string[]).map((storageId, index) => ({
            storageId,
            url: data.registration.imageUrls?.[index] || "",
            name: `Uploaded image ${index + 1}`,
          }))
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoading(false);
      }
    }

    void loadProfile();
  }, [token]);

  const imageCount = useMemo(() => uploadedImages.length, [uploadedImages]);

  async function handleImageUpload(files: FileList | null) {
    if (!files?.length) return;

    const remainingSlots = 3 - uploadedImages.length;
    if (remainingSlots <= 0) {
      setError("You can upload up to 3 images.");
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const chosenFiles = Array.from(files).slice(0, remainingSlots);
      const newImages: UploadedImage[] = [];

      for (const file of chosenFiles) {
        const preparedFile = await prepareImageFileForUpload(file);
        const uploadUrl = await generateUploadUrl({});
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: {
            "Content-Type": preparedFile.type || "application/octet-stream",
          },
          body: preparedFile,
        });

        if (!result.ok) {
          throw new Error(`Failed to upload ${preparedFile.name}`);
        }

        const { storageId } = await result.json();
        newImages.push({
          storageId,
          url: URL.createObjectURL(preparedFile),
          name: preparedFile.name,
        });
      }

      setUploadedImages((current) => [...current, ...newImages]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsUploading(false);
    }
  }

  function removeImage(storageId: string) {
    setUploadedImages((current) => current.filter((image) => image.storageId !== storageId));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;

    setIsSaving(true);
    setMessage(null);
    setError(null);

    if (uploadedImages.length < 1 || uploadedImages.length > 3) {
      setError("Please upload between 1 and 3 photos.");
      setIsSaving(false);
      return;
    }

    try {
      const response = await fetch(`/api/profile/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ethnicity: profile.ethnicity,
          imageStorageIds: uploadedImages.map((image) => image.storageId),
          prayerCommitment: profile.prayerCommitment,
          hijabResponse: profile.hijabResponse,
          spouseRequirement1: profile.spouseRequirement1,
          spouseRequirement2: profile.spouseRequirement2,
          spouseRequirement3: profile.spouseRequirement3,
          shareableBio: profile.shareableBio,
          photoSharingPermission: profile.photoSharingPermission,
          interestSubmission: profile.interestSubmission,
          interestSubmissionNumbers: profile.interestSubmissionNumbers
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value > 0),
          applicantNotesToAdmin: profile.applicantNotesToAdmin,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to save profile");
      }

      setMessage("Your profile has been saved successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <section className="panel">
        <div className="coming-soon compact">
          <div className="lede">Loading profile...</div>
        </div>
      </section>
    );
  }

  if (error && !profile) {
    return (
      <section className="panel applicant-profile-message">
        <p className="notice error">{error}</p>
      </section>
    );
  }

  if (!profile) {
    return (
      <section className="panel applicant-profile-message">
        <p className="notice error">Profile not found.</p>
      </section>
    );
  }

  const hijabLabel =
    profile.gender === "female"
      ? "Do you wear hijab?"
      : "Do you wish for your wife to wear hijab?";

  const isComplete = profile.profileCompletionStatus === "completed";

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h3>{profile.name}</h3>
          <p>{profile.email}</p>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="profile-form">
        {!isComplete && (
          <p className="notice warning">Complete your profile to start matching.</p>
        )}

        <div className="profile-grid two">
          <div className="field">
            <label htmlFor="ethnicity">Ethnicity *</label>
            <input
              id="ethnicity"
              value={profile.ethnicity}
              onChange={(event) => setProfile({ ...profile, ethnicity: event.target.value })}
              placeholder="e.g. Arab, South Asian, Somali"
            />
          </div>
          <div className="field">
            <label htmlFor="prayerCommitment">Prayer commitment *</label>
            <select
              id="prayerCommitment"
              value={profile.prayerCommitment}
              onChange={(event) =>
                setProfile({ ...profile, prayerCommitment: event.target.value as PrayerCommitment })
              }
            >
              <option value="">Select one</option>
              {prayerOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="profile-grid two">
          <div className="field">
            <label htmlFor="hijabResponse">{hijabLabel} *</label>
            <select
              id="hijabResponse"
              value={profile.hijabResponse}
              onChange={(event) =>
                setProfile({ ...profile, hijabResponse: event.target.value as HijabResponse })
              }
            >
              <option value="">Select one</option>
              {yesNoOpenOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="photoSharingPermission">Photo sharing permission *</label>
            <select
              id="photoSharingPermission"
              value={profile.photoSharingPermission}
              onChange={(event) =>
                setProfile({
                  ...profile,
                  photoSharingPermission: event.target.value as PhotoSharingPermission,
                })
              }
            >
              <option value="">Select one</option>
              {photoSharingOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="field-hint">
              Your picture will not be shared with anyone without your permission.
            </p>
          </div>
        </div>

        <div className="photo-upload-box">
          <div>
            <h4>Pictures *</h4>
            <p>Upload up to 3 images. At least 1 is required.</p>
          </div>
          <div className="field">
            <input
              id="photos"
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => void handleImageUpload(event.target.files)}
              disabled={isUploading || uploadedImages.length >= 3}
            />
          </div>
          <div className="mono">
            {isUploading ? "Uploading..." : `${imageCount} / 3 uploaded`}
          </div>
          {uploadedImages.length > 0 && (
            <div className="photo-grid">
              {uploadedImages.map((image) => (
                <div key={image.storageId} className="photo-card">
                  <Image src={image.url} alt={image.name} width={320} height={128} unoptimized />
                  <div>
                    <p>{image.name}</p>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => removeImage(image.storageId)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="profile-grid three">
          {([1, 2, 3] as const).map((n) => {
            const key = `spouseRequirement${n}` as
              | "spouseRequirement1"
              | "spouseRequirement2"
              | "spouseRequirement3";
            return (
              <div className="field" key={key}>
                <label htmlFor={key}>Top spouse requirement {n} *</label>
                <input
                  id={key}
                  value={profile[key]}
                  onChange={(event) => setProfile({ ...profile, [key]: event.target.value })}
                />
              </div>
            );
          })}
        </div>

        <div className="field">
          <label htmlFor="shareableBio">
            A short bio you would be comfortable sharing with a potential match *
          </label>
          <textarea
            id="shareableBio"
            value={profile.shareableBio}
            onChange={(event) => setProfile({ ...profile, shareableBio: event.target.value })}
            rows={6}
          />
        </div>

        <div className="field">
          <label>
            Do you have any interests from a previous event that you would like us to follow up on?
          </label>
          <div className="profile-grid three">
            {[0, 1, 2].map((index) => (
              <div key={`interest-number-${index}`} className="field">
                <label htmlFor={`interestSubmissionNumber${index + 1}`}>
                  Applicant number {index + 1}
                </label>
                <input
                  id={`interestSubmissionNumber${index + 1}`}
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={profile.interestSubmissionNumbers[index] || ""}
                  onChange={(event) => {
                    const nextNumbers = [...profile.interestSubmissionNumbers];
                    nextNumbers[index] = event.target.value;
                    setProfile({
                      ...profile,
                      interestSubmissionNumbers: nextNumbers,
                      interestSubmission: nextNumbers.filter(Boolean).join(", "),
                    });
                  }}
                  placeholder="e.g. 137"
                />
              </div>
            ))}
          </div>
          <p className="field-hint">
            Enter up to 3 applicant numbers. We will create the matching interests automatically.
          </p>
        </div>

        <div className="field">
          <label htmlFor="applicantNotesToAdmin">Anything you want the admin team to know?</label>
          <textarea
            id="applicantNotesToAdmin"
            value={profile.applicantNotesToAdmin}
            onChange={(event) =>
              setProfile({ ...profile, applicantNotesToAdmin: event.target.value })
            }
            rows={4}
            placeholder="Optional note for the admin team"
          />
        </div>

        {message && <p className="notice success">{message}</p>}
        {error && <p className="notice error">{error}</p>}

        <button
          type="submit"
          className="btn btn-primary full"
          disabled={isSaving || isUploading}
        >
          {isSaving ? "Saving..." : "Save profile"}
        </button>
      </form>
    </section>
  );
}
