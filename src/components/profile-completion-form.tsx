"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { prepareImageFileForUpload } from "@/lib/image-upload";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
    return <Card className="p-8">Loading profile...</Card>;
  }

  if (error && !profile) {
    return <Card className="p-8 text-red-600">{error}</Card>;
  }

  if (!profile) {
    return <Card className="p-8">Profile not found.</Card>;
  }

  const hijabLabel =
    profile.gender === "female"
      ? "Do you wear hijab?"
      : "Do you wish for your wife to wear hijab?";

  return (
    <Card className="p-8 shadow-lg">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">{profile.name}</h2>
          <p className="text-sm text-slate-600">{profile.email}</p>
        </div>

        {profile.profileCompletionStatus !== "completed" && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Complete your profile to start matching.
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ethnicity">Ethnicity *</Label>
            <Input
              id="ethnicity"
              value={profile.ethnicity}
              onChange={(e) => setProfile({ ...profile, ethnicity: e.target.value })}
              placeholder="e.g. Arab, South Asian, Somali"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="prayerCommitment">How would you describe your commitment to prayer? *</Label>
            <Select
              value={profile.prayerCommitment}
              onValueChange={(value) => setProfile({ ...profile, prayerCommitment: value as PrayerCommitment })}
            >
              <SelectTrigger id="prayerCommitment">
                <SelectValue placeholder="Select one" />
              </SelectTrigger>
              <SelectContent>
                {prayerOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="hijabResponse">{hijabLabel} *</Label>
          <Select
            value={profile.hijabResponse}
            onValueChange={(value) => setProfile({ ...profile, hijabResponse: value as HijabResponse })}
          >
            <SelectTrigger id="hijabResponse">
              <SelectValue placeholder="Select one" />
            </SelectTrigger>
            <SelectContent>
              {yesNoOpenOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="photoSharingPermission">
            Are you comfortable with your photos being shared with a potential match? *
          </Label>
          <Select
            value={profile.photoSharingPermission}
            onValueChange={(value) => setProfile({ ...profile, photoSharingPermission: value as PhotoSharingPermission })}
          >
            <SelectTrigger id="photoSharingPermission">
              <SelectValue placeholder="Select one" />
            </SelectTrigger>
            <SelectContent>
              {photoSharingOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-slate-500">
            Your picture will not be shared with anyone without your permission.
          </p>
        </div>

        <div className="space-y-3 rounded-lg border border-slate-200 p-4">
          <div>
            <Label htmlFor="photos">Pictures *</Label>
            <p className="text-xs text-slate-500 mt-1">Upload up to 3 images. At least 1 is required.</p>
          </div>
          <Input id="photos" type="file" accept="image/*" multiple onChange={(e) => void handleImageUpload(e.target.files)} disabled={isUploading || uploadedImages.length >= 3} />
          <p className="text-xs text-slate-500">{isUploading ? "Uploading image..." : `${imageCount} / 3 images uploaded`}</p>
          {uploadedImages.length > 0 && (
            <div className="grid gap-3 md:grid-cols-3">
              {uploadedImages.map((image) => (
                <div key={image.storageId} className="rounded-lg border border-slate-200 p-2 space-y-2">
                  <img src={image.url} alt={image.name} className="h-28 w-full rounded object-cover" />
                  <p className="truncate text-xs text-slate-600">{image.name}</p>
                  <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => removeImage(image.storageId)}>Remove</Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="requirement1">Top spouse requirement 1 *</Label>
            <Input id="requirement1" value={profile.spouseRequirement1} onChange={(e) => setProfile({ ...profile, spouseRequirement1: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="requirement2">Top spouse requirement 2 *</Label>
            <Input id="requirement2" value={profile.spouseRequirement2} onChange={(e) => setProfile({ ...profile, spouseRequirement2: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="requirement3">Top spouse requirement 3 *</Label>
            <Input id="requirement3" value={profile.spouseRequirement3} onChange={(e) => setProfile({ ...profile, spouseRequirement3: e.target.value })} />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="shareableBio">Provide a basic bio about yourself that you would be comfortable sharing with a potential match *</Label>
          <textarea
            id="shareableBio"
            value={profile.shareableBio}
            onChange={(e) => setProfile({ ...profile, shareableBio: e.target.value })}
            className="flex min-h-[140px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            rows={6}
          />
        </div>

        <div className="space-y-3">
          <Label>Do you have any interests from a previous event that you would like us to follow up on?</Label>
          <div className="grid gap-4 md:grid-cols-3">
            {[0, 1, 2].map((index) => (
              <div key={`interest-number-${index}`} className="space-y-2">
                <Label htmlFor={`interestSubmissionNumber${index + 1}`}>Applicant number {index + 1}</Label>
                <Input
                  id={`interestSubmissionNumber${index + 1}`}
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={profile.interestSubmissionNumbers[index] || ""}
                  onChange={(e) => {
                    const nextNumbers = [...profile.interestSubmissionNumbers];
                    nextNumbers[index] = e.target.value;
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
          <p className="text-xs text-slate-500">Enter up to 3 applicant numbers. We will create the matching interests automatically.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="applicantNotesToAdmin">Anything you want the admin team to know?</Label>
          <textarea
            id="applicantNotesToAdmin"
            value={profile.applicantNotesToAdmin}
            onChange={(e) => setProfile({ ...profile, applicantNotesToAdmin: e.target.value })}
            className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            rows={4}
            placeholder="Optional note for the admin team"
          />
        </div>

        {message && <p className="text-sm text-green-700">{message}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button type="submit" disabled={isSaving || isUploading} className="w-full">
          {isSaving ? "Saving..." : "Save Profile"}
        </Button>
      </form>
    </Card>
  );
}
