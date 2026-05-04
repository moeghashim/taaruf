"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { prepareImageFileForUpload } from "@/lib/image-upload";
import { Ico } from "@/components/admin/primitives/icons";

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
  const [submitError, setSubmitError] = useState<string | null>(null);
  const stats = useQuery(api.registrations.getStats) as
    | { maleCount: number; femaleCount: number; maleLimit: number; femaleLimit: number }
    | undefined;
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
      backgroundCheckConsent: false,
    } as RegistrationFormData,
    onSubmit: async ({ value }) => {
      if (uploadedImages.length < 1) {
        setUploadError("Please upload at least 1 photo.");
        return;
      }

      setIsSubmitting(true);
      setUploadError(null);
      setSubmitError(null);
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
        setSubmitError("Failed to proceed to payment. Please try again.");
        setIsSubmitting(false);
      }
    },
  });

  const isMaleFull = !!(stats && stats.maleCount >= stats.maleLimit);
  const isFemaleFull = !!(stats && stats.femaleCount >= stats.femaleLimit);

  const hijabLabel = useMemo(
    () =>
      form.state.values.gender === "female"
        ? "Do you wear hijab?"
        : "Do you wish for your wife to wear hijab?",
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
    <section className="panel applicant-register-form">
      <div className="panel-head">
        <div>
          <h3>Application</h3>
          <p>$10 registration fee — paid via Stripe at the next step.</p>
        </div>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          form.handleSubmit();
        }}
        className="applicant-form"
      >
        <form.Field
          name="name"
          validators={{
            onChange: ({ value }) =>
              !value || value.trim().length === 0 ? "Name is required" : undefined,
          }}
        >
          {(field) => (
            <div className="field">
              <label htmlFor={field.name}>Full name *</label>
              <input
                id={field.name}
                type="text"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                placeholder="Enter your full name"
              />
              {field.state.meta.errors?.length > 0 && (
                <p className="field-error">{field.state.meta.errors.join(", ")}</p>
              )}
            </div>
          )}
        </form.Field>

        <div className="profile-grid two">
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
              <div className="field">
                <label htmlFor={field.name}>Age *</label>
                <input
                  id={field.name}
                  type="number"
                  min="18"
                  max="99"
                  value={field.state.value || ""}
                  onChange={(e) => field.handleChange(parseInt(e.target.value) || 0)}
                  onBlur={field.handleBlur}
                  placeholder="18-99"
                />
                {field.state.meta.errors?.length > 0 && (
                  <p className="field-error">{field.state.meta.errors.join(", ")}</p>
                )}
              </div>
            )}
          </form.Field>

          <form.Field
            name="gender"
            validators={{ onChange: ({ value }) => (!value ? "Gender is required" : undefined) }}
          >
            {(field) => (
              <div className="field">
                <label htmlFor={field.name}>Gender *</label>
                <select
                  id={field.name}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value as "male" | "female" | "")}
                  onBlur={field.handleBlur}
                >
                  <option value="">Select gender</option>
                  <option value="male">Male{isMaleFull ? " (Waitlist)" : ""}</option>
                  <option value="female">Female{isFemaleFull ? " (Waitlist)" : ""}</option>
                </select>
                {field.state.meta.errors?.length > 0 && (
                  <p className="field-error">{field.state.meta.errors.join(", ")}</p>
                )}
              </div>
            )}
          </form.Field>
        </div>

        <div className="profile-grid two">
          <form.Field
            name="maritalStatus"
            validators={{
              onChange: ({ value }) => (!value ? "Marital status is required" : undefined),
            }}
          >
            {(field) => (
              <div className="field">
                <label htmlFor={field.name}>Marital status *</label>
                <select
                  id={field.name}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                >
                  <option value="">Select marital status</option>
                  <option value="single">Single</option>
                  <option value="divorced">Divorced</option>
                  <option value="divorced_with_children">Divorced with Children</option>
                  <option value="widowed">Widowed</option>
                  <option value="widowed_with_children">Widowed with Children</option>
                </select>
                {field.state.meta.errors?.length > 0 && (
                  <p className="field-error">{field.state.meta.errors.join(", ")}</p>
                )}
              </div>
            )}
          </form.Field>

          <form.Field
            name="education"
            validators={{
              onChange: ({ value }) => (!value ? "Education is required" : undefined),
            }}
          >
            {(field) => (
              <div className="field">
                <label htmlFor={field.name}>Education level *</label>
                <select
                  id={field.name}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                >
                  <option value="">Select education level</option>
                  <option value="highSchool">High School</option>
                  <option value="bachelor">Bachelor&apos;s</option>
                  <option value="master">Master&apos;s</option>
                  <option value="phd">PhD</option>
                </select>
                {field.state.meta.errors?.length > 0 && (
                  <p className="field-error">{field.state.meta.errors.join(", ")}</p>
                )}
              </div>
            )}
          </form.Field>
        </div>

        <div className="profile-grid two">
          <form.Field
            name="job"
            validators={{
              onChange: ({ value }) =>
                !value || value.trim().length === 0 ? "Job/Occupation is required" : undefined,
            }}
          >
            {(field) => (
              <div className="field">
                <label htmlFor={field.name}>Job / occupation *</label>
                <input
                  id={field.name}
                  type="text"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  placeholder="e.g. Software engineer, Teacher"
                />
                {field.state.meta.errors?.length > 0 && (
                  <p className="field-error">{field.state.meta.errors.join(", ")}</p>
                )}
              </div>
            )}
          </form.Field>

          <form.Field
            name="ethnicity"
            validators={{
              onChange: ({ value }) =>
                !value || value.trim().length === 0 ? "Ethnicity is required" : undefined,
            }}
          >
            {(field) => (
              <div className="field">
                <label htmlFor={field.name}>Ethnicity *</label>
                <input
                  id={field.name}
                  type="text"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  placeholder="e.g. Arab, South Asian, Somali"
                />
                {field.state.meta.errors?.length > 0 && (
                  <p className="field-error">{field.state.meta.errors.join(", ")}</p>
                )}
              </div>
            )}
          </form.Field>
        </div>

        <div className="profile-grid two">
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
              <div className="field">
                <label htmlFor={field.name}>Email address *</label>
                <input
                  id={field.name}
                  type="email"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  placeholder="you@example.com"
                />
                {field.state.meta.errors?.length > 0 && (
                  <p className="field-error">{field.state.meta.errors.join(", ")}</p>
                )}
              </div>
            )}
          </form.Field>

          <form.Field
            name="phone"
            validators={{
              onChange: ({ value }) =>
                !value || value.trim().length === 0 ? "Phone number is required" : undefined,
            }}
          >
            {(field) => (
              <div className="field">
                <label htmlFor={field.name}>Phone number *</label>
                <input
                  id={field.name}
                  type="tel"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  placeholder="+1 (555) 123-4567"
                />
                {field.state.meta.errors?.length > 0 && (
                  <p className="field-error">{field.state.meta.errors.join(", ")}</p>
                )}
              </div>
            )}
          </form.Field>
        </div>

        <form.Field
          name="prayerCommitment"
          validators={{
            onChange: ({ value }) => (!value ? "Prayer commitment is required" : undefined),
          }}
        >
          {(field) => (
            <div className="field">
              <label htmlFor={field.name}>How would you describe your commitment to prayer? *</label>
              <select
                id={field.name}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value as PrayerCommitment)}
                onBlur={field.handleBlur}
              >
                <option value="">Select one</option>
                {prayerOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {field.state.meta.errors?.length > 0 && (
                <p className="field-error">{field.state.meta.errors.join(", ")}</p>
              )}
            </div>
          )}
        </form.Field>

        <form.Field
          name="hijabResponse"
          validators={{
            onChange: ({ value }) => (!value ? "This field is required" : undefined),
          }}
        >
          {(field) => (
            <div className="field">
              <label htmlFor={field.name}>{hijabLabel} *</label>
              <select
                id={field.name}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value as HijabResponse)}
                onBlur={field.handleBlur}
              >
                <option value="">Select one</option>
                {yesNoOpenOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {field.state.meta.errors?.length > 0 && (
                <p className="field-error">{field.state.meta.errors.join(", ")}</p>
              )}
            </div>
          )}
        </form.Field>

        <form.Field
          name="photoSharingPermission"
          validators={{
            onChange: ({ value }) =>
              !value ? "Photo sharing permission is required" : undefined,
          }}
        >
          {(field) => (
            <div className="field">
              <label htmlFor={field.name}>Photo sharing permission *</label>
              <select
                id={field.name}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value as PhotoSharingPermission)}
                onBlur={field.handleBlur}
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
              {field.state.meta.errors?.length > 0 && (
                <p className="field-error">{field.state.meta.errors.join(", ")}</p>
              )}
            </div>
          )}
        </form.Field>

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
              onChange={(event) => {
                void handleImageUpload(event.target.files);
                event.currentTarget.value = "";
              }}
              disabled={uploadingImage || uploadedImages.length >= 3}
            />
          </div>
          <div className="mono">
            {uploadingImage ? "Uploading..." : `${uploadedImages.length} / 3 uploaded`}
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
          {uploadError && <p className="notice error">{uploadError}</p>}
        </div>

        <div className="profile-grid three">
          {([1, 2, 3] as const).map((n) => {
            const key = `spouseRequirement${n}` as
              | "spouseRequirement1"
              | "spouseRequirement2"
              | "spouseRequirement3";
            return (
              <form.Field
                key={key}
                name={key}
                validators={{
                  onChange: ({ value }) =>
                    !value || value.trim().length === 0
                      ? `Requirement ${n} is required`
                      : undefined,
                }}
              >
                {(field) => (
                  <div className="field">
                    <label htmlFor={field.name}>Top spouse requirement {n} *</label>
                    <input
                      id={field.name}
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                    />
                    {field.state.meta.errors?.length > 0 && (
                      <p className="field-error">{field.state.meta.errors.join(", ")}</p>
                    )}
                  </div>
                )}
              </form.Field>
            );
          })}
        </div>

        <form.Field
          name="basicBio"
          validators={{
            onChange: ({ value }) =>
              !value || value.trim().length === 0 ? "Basic bio is required" : undefined,
          }}
        >
          {(field) => (
            <div className="field">
              <label htmlFor={field.name}>
                A short bio you would be comfortable sharing with a potential match *
              </label>
              <textarea
                id={field.name}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                placeholder="Tell us about yourself..."
                rows={5}
              />
              {field.state.meta.errors?.length > 0 && (
                <p className="field-error">{field.state.meta.errors.join(", ")}</p>
              )}
            </div>
          )}
        </form.Field>

        <form.Field
          name="backgroundCheckConsent"
          validators={{
            onChange: ({ value }) =>
              !value ? "You must consent to a background check to register" : undefined,
          }}
        >
          {(field) => (
            <div className="field">
              <label htmlFor={field.name} className="consent">
                <input
                  id={field.name}
                  type="checkbox"
                  checked={field.state.value}
                  onChange={(e) => field.handleChange(e.target.checked)}
                  onBlur={field.handleBlur}
                />
                <span>
                  I consent to a background check being conducted by the 1Plus1 team as part of the
                  registration process. *
                </span>
              </label>
              {field.state.meta.errors?.length > 0 && (
                <p className="field-error">{field.state.meta.errors.join(", ")}</p>
              )}
            </div>
          )}
        </form.Field>

        {(isMaleFull || isFemaleFull) && (
          <p className="notice warning">
            {isMaleFull && isFemaleFull
              ? "Registration is full for both genders. New registrations will be placed on a waitlist."
              : isMaleFull
              ? "Male registration is full. New male registrations will be placed on a waitlist."
              : "Female registration is full. New female registrations will be placed on a waitlist."}
          </p>
        )}

        {submitError && <p className="notice error">{submitError}</p>}

        <button
          type="submit"
          className="btn btn-primary full"
          disabled={isSubmitting || uploadingImage}
        >
          {Ico.heart}
          <span>{isSubmitting ? "Redirecting to payment..." : "Proceed to payment ($10)"}</span>
        </button>

        <p className="form-foot">
          You will be redirected to Stripe to complete your $10 registration payment. Have a promo
          code? You can enter it at checkout.
        </p>
      </form>
    </section>
  );
}
