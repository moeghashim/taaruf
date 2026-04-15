"use client";

import { useMemo, useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type PrayerCommitment = "sometimes" | "strive_five" | "always_five" | "five_and_sunnah" | "";
type HijabResponse = "yes" | "no" | "open" | "";
type PhotoSharingPermission = "yes" | "no" | "ask_me_first" | "";

interface UploadedImage {
  storageId: string;
  url: string;
  name: string;
}

interface RegistrationFormData {
  name: string;
  age: number;
  gender: "male" | "female" | "";
  maritalStatus: string;
  education: string;
  job: string;
  email: string;
  phone: string;
  ethnicity: string;
  prayerCommitment: PrayerCommitment;
  hijabResponse: HijabResponse;
  spouseRequirement1: string;
  spouseRequirement2: string;
  spouseRequirement3: string;
  basicBio: string;
  photoSharingPermission: PhotoSharingPermission;
  interestSubmission: string;
  backgroundCheckConsent: boolean;
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

export function RegistrationForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const stats = useQuery(api.registrations.getStats) as { maleCount: number; femaleCount: number; maleLimit: number; femaleLimit: number } | undefined;
  const generateUploadUrl = useMutation(api.registrations.generateImageUploadUrl);

  const form = useForm({
    defaultValues: {
      name: "",
      age: 0,
      gender: "",
      maritalStatus: "",
      education: "",
      job: "",
      email: "",
      phone: "",
      ethnicity: "",
      prayerCommitment: "",
      hijabResponse: "",
      spouseRequirement1: "",
      spouseRequirement2: "",
      spouseRequirement3: "",
      basicBio: "",
      photoSharingPermission: "",
      interestSubmission: "",
      backgroundCheckConsent: false,
    } as RegistrationFormData,
    onSubmit: async ({ value }) => {
      if (uploadedImages.length < 1) {
        setUploadError("Please upload at least 1 photo.");
        return;
      }

      setIsSubmitting(true);
      setUploadError(null);
      try {
        const response = await fetch("/api/create-checkout-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: value.name,
            age: value.age,
            gender: value.gender,
            maritalStatus: value.maritalStatus,
            education: value.education,
            job: value.job,
            email: value.email,
            phone: value.phone,
            ethnicity: value.ethnicity,
            prayerCommitment: value.prayerCommitment,
            hijabResponse: value.hijabResponse,
            spouseRequirement1: value.spouseRequirement1,
            spouseRequirement2: value.spouseRequirement2,
            spouseRequirement3: value.spouseRequirement3,
            shareableBio: value.basicBio,
            photoSharingPermission: value.photoSharingPermission,
            interestSubmission: value.interestSubmission,
            imageStorageIds: uploadedImages.map((image) => image.storageId),
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to create checkout session");
        }

        window.location.href = data.url;
      } catch (error) {
        console.error("Registration error:", error);
        alert("Failed to proceed to payment. Please try again.");
        setIsSubmitting(false);
      }
    },
  });

  const isMaleFull = stats && stats.maleCount >= stats.maleLimit;
  const isFemaleFull = stats && stats.femaleCount >= stats.femaleLimit;

  const hijabLabel = useMemo(
    () =>
      form.state.values.gender === "female"
        ? "Do you wear hijab? *"
        : "Do you wish for your wife to wear hijab? *",
    [form.state.values.gender]
  );

  async function handleImageUpload(files: FileList | null) {
    if (!files?.length) return;

    const remainingSlots = 3 - uploadedImages.length;
    if (remainingSlots <= 0) {
      setUploadError("You can upload up to 3 images.");
      return;
    }

    setUploadingImage(true);
    setUploadError(null);

    try {
      const chosenFiles = Array.from(files).slice(0, remainingSlots);
      const newImages: UploadedImage[] = [];

      for (const file of chosenFiles) {
        const uploadUrl = await generateUploadUrl({});
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: {
            "Content-Type": file.type || "application/octet-stream",
          },
          body: file,
        });

        if (!result.ok) {
          throw new Error(`Failed to upload ${file.name}`);
        }

        const { storageId } = await result.json();
        newImages.push({
          storageId,
          url: URL.createObjectURL(file),
          name: file.name,
        });
      }

      setUploadedImages((current) => [...current, ...newImages]);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : String(error));
    } finally {
      setUploadingImage(false);
    }
  }

  function removeImage(storageId: string) {
    setUploadedImages((current) => current.filter((image) => image.storageId !== storageId));
  }

  return (
    <Card className="p-8 shadow-lg">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
        className="space-y-6"
      >
        <form.Field
          name="name"
          validators={{
            onChange: ({ value }) =>
              !value || value.trim().length === 0 ? "Name is required" : undefined,
          }}
        >
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Full Name *</Label>
              <Input id={field.name} type="text" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} placeholder="Enter your full name" className="h-10" />
              {field.state.meta.errors?.length > 0 && <p className="text-red-500 text-sm">{field.state.meta.errors.join(", ")}</p>}
            </div>
          )}
        </form.Field>

        <form.Field
          name="age"
          validators={{
            onChange: ({ value }) => {
              if (!value) return "Age is required";
              if (value < 18 || value > 99) return "Age must be between 18 and 99";
              return undefined;
            },
          }}
        >
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Age *</Label>
              <Input id={field.name} type="number" min="18" max="99" value={field.state.value || ""} onChange={(e) => field.handleChange(parseInt(e.target.value) || 0)} onBlur={field.handleBlur} placeholder="18-99" className="h-10" />
              {field.state.meta.errors?.length > 0 && <p className="text-red-500 text-sm">{field.state.meta.errors.join(", ")}</p>}
            </div>
          )}
        </form.Field>

        <form.Field
          name="gender"
          validators={{ onChange: ({ value }) => (!value ? "Gender is required" : undefined) }}
        >
          {(field) => (
            <div className="space-y-3">
              <Label>Gender *</Label>
              <RadioGroup value={field.state.value} onValueChange={(val) => field.handleChange(val as "male" | "female" | "")} onBlur={field.handleBlur}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="male" id="male" />
                  <Label htmlFor="male" className="font-normal cursor-pointer">Male {isMaleFull && <span className="text-amber-600 text-sm ml-2">(Waitlist)</span>}</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="female" id="female" />
                  <Label htmlFor="female" className="font-normal cursor-pointer">Female {isFemaleFull && <span className="text-amber-600 text-sm ml-2">(Waitlist)</span>}</Label>
                </div>
              </RadioGroup>
              {field.state.meta.errors?.length > 0 && <p className="text-red-500 text-sm">{field.state.meta.errors.join(", ")}</p>}
            </div>
          )}
        </form.Field>

        <div className="grid gap-6 md:grid-cols-2">
          <form.Field
            name="maritalStatus"
            validators={{ onChange: ({ value }) => (!value ? "Marital status is required" : undefined) }}
          >
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="maritalStatus">Marital Status *</Label>
                <Select value={field.state.value} onValueChange={(value) => field.handleChange(value)}>
                  <SelectTrigger id="maritalStatus" onBlur={field.handleBlur}><SelectValue placeholder="Select marital status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Single</SelectItem>
                    <SelectItem value="divorced">Divorced</SelectItem>
                    <SelectItem value="divorced_with_children">Divorced with Children</SelectItem>
                    <SelectItem value="widowed">Widowed</SelectItem>
                    <SelectItem value="widowed_with_children">Widowed with Children</SelectItem>
                  </SelectContent>
                </Select>
                {field.state.meta.errors?.length > 0 && <p className="text-red-500 text-sm">{field.state.meta.errors.join(", ")}</p>}
              </div>
            )}
          </form.Field>

          <form.Field
            name="education"
            validators={{ onChange: ({ value }) => (!value ? "Education is required" : undefined) }}
          >
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="education">Education Level *</Label>
                <Select value={field.state.value} onValueChange={(value) => field.handleChange(value)}>
                  <SelectTrigger id="education" onBlur={field.handleBlur}><SelectValue placeholder="Select education level" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="highSchool">High School</SelectItem>
                    <SelectItem value="bachelor">Bachelor&apos;s</SelectItem>
                    <SelectItem value="master">Master&apos;s</SelectItem>
                    <SelectItem value="phd">PhD</SelectItem>
                  </SelectContent>
                </Select>
                {field.state.meta.errors?.length > 0 && <p className="text-red-500 text-sm">{field.state.meta.errors.join(", ")}</p>}
              </div>
            )}
          </form.Field>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <form.Field
            name="job"
            validators={{ onChange: ({ value }) => (!value || value.trim().length === 0 ? "Job/Occupation is required" : undefined) }}
          >
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Job/Occupation *</Label>
                <Input id={field.name} type="text" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} placeholder="e.g., Software Engineer, Teacher, etc." className="h-10" />
                {field.state.meta.errors?.length > 0 && <p className="text-red-500 text-sm">{field.state.meta.errors.join(", ")}</p>}
              </div>
            )}
          </form.Field>

          <form.Field
            name="ethnicity"
            validators={{ onChange: ({ value }) => (!value || value.trim().length === 0 ? "Ethnicity is required" : undefined) }}
          >
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Ethnicity *</Label>
                <Input id={field.name} type="text" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} placeholder="Enter your ethnicity" className="h-10" />
                {field.state.meta.errors?.length > 0 && <p className="text-red-500 text-sm">{field.state.meta.errors.join(", ")}</p>}
              </div>
            )}
          </form.Field>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <form.Field
            name="email"
            validators={{
              onChange: ({ value }) => {
                if (!value) return "Email is required";
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(value)) return "Please enter a valid email address";
                return undefined;
              },
            }}
          >
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Email Address *</Label>
                <Input id={field.name} type="email" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} placeholder="your.email@example.com" className="h-10" />
                {field.state.meta.errors?.length > 0 && <p className="text-red-500 text-sm">{field.state.meta.errors.join(", ")}</p>}
              </div>
            )}
          </form.Field>

          <form.Field
            name="phone"
            validators={{ onChange: ({ value }) => (!value || value.trim().length === 0 ? "Phone number is required" : undefined) }}
          >
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Phone Number *</Label>
                <Input id={field.name} type="tel" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} placeholder="+1 (555) 123-4567" className="h-10" />
                {field.state.meta.errors?.length > 0 && <p className="text-red-500 text-sm">{field.state.meta.errors.join(", ")}</p>}
              </div>
            )}
          </form.Field>
        </div>

        <form.Field
          name="prayerCommitment"
          validators={{ onChange: ({ value }) => (!value ? "Prayer commitment is required" : undefined) }}
        >
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="prayerCommitment">How would you describe your commitment to prayer? *</Label>
              <Select value={field.state.value} onValueChange={(value) => field.handleChange(value as PrayerCommitment)}>
                <SelectTrigger id="prayerCommitment" onBlur={field.handleBlur}><SelectValue placeholder="Select one" /></SelectTrigger>
                <SelectContent>
                  {prayerOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {field.state.meta.errors?.length > 0 && <p className="text-red-500 text-sm">{field.state.meta.errors.join(", ")}</p>}
            </div>
          )}
        </form.Field>

        <form.Field
          name="hijabResponse"
          validators={{ onChange: ({ value }) => (!value ? "This field is required" : undefined) }}
        >
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="hijabResponse">{hijabLabel}</Label>
              <Select value={field.state.value} onValueChange={(value) => field.handleChange(value as HijabResponse)}>
                <SelectTrigger id="hijabResponse" onBlur={field.handleBlur}><SelectValue placeholder="Select one" /></SelectTrigger>
                <SelectContent>
                  {yesNoOpenOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {field.state.meta.errors?.length > 0 && <p className="text-red-500 text-sm">{field.state.meta.errors.join(", ")}</p>}
            </div>
          )}
        </form.Field>

        <form.Field
          name="photoSharingPermission"
          validators={{ onChange: ({ value }) => (!value ? "Photo sharing permission is required" : undefined) }}
        >
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="photoSharingPermission">Photo sharing permission *</Label>
              <Select value={field.state.value} onValueChange={(value) => field.handleChange(value as PhotoSharingPermission)}>
                <SelectTrigger id="photoSharingPermission" onBlur={field.handleBlur}><SelectValue placeholder="Select one" /></SelectTrigger>
                <SelectContent>
                  {photoSharingOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">Your picture will not be shared with anyone without your permission.</p>
              {field.state.meta.errors?.length > 0 && <p className="text-red-500 text-sm">{field.state.meta.errors.join(", ")}</p>}
            </div>
          )}
        </form.Field>

        <div className="space-y-3 rounded-lg border border-slate-200 p-4">
          <div>
            <Label htmlFor="photos">Pictures *</Label>
            <p className="text-xs text-slate-500 mt-1">Upload up to 3 images. At least 1 is required. Your picture will not be shared with anyone without your permission.</p>
          </div>
          <Input id="photos" type="file" accept="image/*" multiple onChange={(e) => void handleImageUpload(e.target.files)} disabled={uploadingImage || uploadedImages.length >= 3} />
          <p className="text-xs text-slate-500">{uploadingImage ? "Uploading image..." : `${uploadedImages.length} / 3 images uploaded`}</p>
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
          {uploadError && <p className="text-red-500 text-sm">{uploadError}</p>}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <form.Field
            name="spouseRequirement1"
            validators={{ onChange: ({ value }) => (!value || value.trim().length === 0 ? "Requirement 1 is required" : undefined) }}
          >
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Top spouse requirement 1 *</Label>
                <Input id={field.name} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />
                {field.state.meta.errors?.length > 0 && <p className="text-red-500 text-sm">{field.state.meta.errors.join(", ")}</p>}
              </div>
            )}
          </form.Field>
          <form.Field
            name="spouseRequirement2"
            validators={{ onChange: ({ value }) => (!value || value.trim().length === 0 ? "Requirement 2 is required" : undefined) }}
          >
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Top spouse requirement 2 *</Label>
                <Input id={field.name} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />
                {field.state.meta.errors?.length > 0 && <p className="text-red-500 text-sm">{field.state.meta.errors.join(", ")}</p>}
              </div>
            )}
          </form.Field>
          <form.Field
            name="spouseRequirement3"
            validators={{ onChange: ({ value }) => (!value || value.trim().length === 0 ? "Requirement 3 is required" : undefined) }}
          >
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Top spouse requirement 3 *</Label>
                <Input id={field.name} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />
                {field.state.meta.errors?.length > 0 && <p className="text-red-500 text-sm">{field.state.meta.errors.join(", ")}</p>}
              </div>
            )}
          </form.Field>
        </div>

        <form.Field
          name="basicBio"
          validators={{ onChange: ({ value }) => (!value || value.trim().length === 0 ? "Basic bio is required" : undefined) }}
        >
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Provide a basic bio about yourself that you would be comfortable sharing with a potential match *</Label>
              <textarea id={field.name} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} placeholder="Tell us about yourself in a way you would be comfortable sharing with a potential match..." className="flex min-h-[120px] w-full rounded-md border border-input bg-input px-3 py-2 text-base text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" rows={5} />
              {field.state.meta.errors?.length > 0 && <p className="text-red-500 text-sm">{field.state.meta.errors.join(", ")}</p>}
            </div>
          )}
        </form.Field>

        <form.Field
          name="interestSubmission"
        >
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Optional: are there any applicants you are interested in?</Label>
              <textarea
                id={field.name}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                placeholder="You can list profile numbers, names, or any notes for the admin team."
                className="flex min-h-[120px] w-full rounded-md border border-input bg-input px-3 py-2 text-base text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                rows={5}
              />
              <p className="text-xs text-slate-500">This field is optional.</p>
            </div>
          )}
        </form.Field>

        <form.Field
          name="backgroundCheckConsent"
          validators={{ onChange: ({ value }) => (!value ? "You must consent to a background check to register" : undefined) }}
        >
          {(field) => (
            <div className="space-y-2">
              <div className="flex items-start space-x-3">
                <input id="backgroundCheckConsent" type="checkbox" checked={field.state.value} onChange={(e) => field.handleChange(e.target.checked)} onBlur={field.handleBlur} className="mt-1 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                <Label htmlFor="backgroundCheckConsent" className="font-normal cursor-pointer text-sm leading-relaxed">I consent to a background check being conducted by the 1Plus1 team as part of the registration process. *</Label>
              </div>
              {field.state.meta.errors?.length > 0 && <p className="text-red-500 text-sm">{field.state.meta.errors.join(", ")}</p>}
            </div>
          )}
        </form.Field>

        {(isMaleFull || isFemaleFull) && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-amber-800 text-sm">
              {isMaleFull && isFemaleFull
                ? "Registration is full for both genders. New registrations will be placed on a waitlist."
                : isMaleFull
                ? "Male registration is full. New male registrations will be placed on a waitlist."
                : "Female registration is full. New female registrations will be placed on a waitlist."}
            </p>
          </div>
        )}

        <div className="pt-4">
          <Button type="submit" className="w-full h-11 text-base" disabled={isSubmitting || uploadingImage}>
            {isSubmitting ? "Redirecting to payment..." : "Proceed to Payment ($10)"}
          </Button>
        </div>

        <p className="text-xs text-slate-500 text-center">
          You will be redirected to Stripe to complete your $10 registration payment.
          Have a promo code? You can enter it at checkout.
        </p>
      </form>
    </Card>
  );
}
