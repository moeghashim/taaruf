"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { LogoMark } from "@/components/admin/primitives/logo-mark";
import { Ico } from "@/components/admin/primitives/icons";
import { Pill, type Tone } from "@/components/admin/primitives/status-pill";
import { prepareImageFileForUpload } from "@/lib/image-upload";

type DashboardInterest = {
  interestId: string;
  direction: "inbound" | "outbound" | "private";
  status: string;
  flowStatus: string;
  visibility: string;
  adminStatus: string;
  keepOpenExpiresAt: number | null;
  bioVisibleAt: number | null;
  contactSharedAt: number | null;
  requesterFinalApproval: string;
  recipientFinalApproval: string;
  photoDecision: string;
  counterparty: {
    applicantNumber: number | null;
    name: string | null;
    age: number;
    gender: string;
    shareableBio: string | null;
    email: string | null;
    phone: string | null;
    label: string;
  } | null;
};

type DashboardData = {
  applicant: {
    name: string;
    gender: "male" | "female";
    applicantNumber: number | null;
    profileCompletionStatus: string;
  };
  inbound: DashboardInterest[];
  outbound: DashboardInterest[];
  privateDocumented: DashboardInterest[];
};

type PrayerCommitment = "sometimes" | "strive_five" | "always_five" | "five_and_sunnah" | "";
type HijabResponse = "yes" | "no" | "open" | "";
type PhotoSharingPermission = "yes" | "no" | "ask_me_first" | "";

type UploadedImage = {
  storageId: string;
  url: string;
  name: string;
};

type ProfileData = {
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
};

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

const statusTone: Record<string, Tone> = {
  accepted: "green",
  active: "green",
  approved: "green",
  contact_shared: "green",
  converted_to_match: "green",
  declined: "rose",
  closed: "rose",
  awaiting_inbound_response: "amber",
  kept_open: "amber",
  bio_review: "blue",
  picture_requested: "blue",
  new: "plain",
};

function titleize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sectionId(title: string) {
  return title.toLowerCase().replace(/\s+/g, "-");
}

function formatDate(timestamp: number | null) {
  if (!timestamp) return null;
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function StatusBadge({ value }: { value: string }) {
  return <Pill tone={statusTone[value] ?? "plain"}>{titleize(value)}</Pill>;
}

function InterestCard({
  interest,
  onAction,
  busy,
}: {
  interest: DashboardInterest;
  onAction: (body: Record<string, unknown>) => Promise<void>;
  busy: boolean;
}) {
  const counterparty = interest.counterparty;
  const canRespond =
    interest.direction === "inbound" &&
    interest.visibility !== "internal_only" &&
    (interest.flowStatus === "awaiting_inbound_response" || interest.flowStatus === "kept_open");
  const canFinalApprove = Boolean(
    interest.bioVisibleAt &&
    interest.flowStatus !== "contact_shared" &&
    interest.flowStatus !== "declined" &&
    interest.flowStatus !== "closed"
  );

  return (
    <div className="interest-card">
      <div className="interest-card-head">
        <div>
          <h3>{counterparty?.label ?? "Unknown applicant"}</h3>
          <p>{counterparty ? `${counterparty.gender} · age ${counterparty.age}` : "Profile unavailable"}</p>
        </div>
        <div className="pill-row">
          <StatusBadge value={interest.flowStatus} />
          <StatusBadge value={interest.status} />
        </div>
      </div>

      {interest.keepOpenExpiresAt && (
        <p className="notice warning">Keep Open expires {formatDate(interest.keepOpenExpiresAt)}.</p>
      )}

      {counterparty?.shareableBio && (
        <div className="bio-box">
          <h4>Bio</h4>
          <p>{counterparty.shareableBio}</p>
        </div>
      )}

      {interest.contactSharedAt && counterparty?.email && counterparty.phone && (
        <div className="contact-box">
          <p>Contact info shared</p>
          <p>
            <span>Email</span>
            {counterparty.email}
          </p>
          <p>
            <span>Phone</span>
            {counterparty.phone}
          </p>
        </div>
      )}

      {canRespond && (
        <div className="action-row">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => onAction({ action: "respond", interestId: interest.interestId, decision: "accept" })}
          >
            Accept
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => onAction({ action: "respond", interestId: interest.interestId, decision: "keep_open" })}
          >
            Keep Open
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => onAction({ action: "respond", interestId: interest.interestId, decision: "decline" })}
          >
            Decline
          </button>
        </div>
      )}

      {canFinalApprove && (
        <div className="action-row">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => onAction({ action: "final_approval", interestId: interest.interestId, approved: true })}
          >
            Final Approval
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => onAction({ action: "final_approval", interestId: interest.interestId, approved: false })}
          >
            Decline After Bio
          </button>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  description,
  interests,
  onAction,
  busy,
}: {
  title: string;
  description: string;
  interests: DashboardInterest[];
  onAction: (body: Record<string, unknown>) => Promise<void>;
  busy: boolean;
}) {
  return (
    <section id={sectionId(title)} className="panel applicant-section">
      <div className="panel-head">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <span className="mono">
          {interests.length} item{interests.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="interest-list">
        {interests.length ? (
          interests.map((interest) => (
            <InterestCard key={interest.interestId} interest={interest} onAction={onAction} busy={busy} />
          ))
        ) : (
          <div className="coming-soon compact">
            <div className="lede">Nothing to show right now.</div>
          </div>
        )}
      </div>
    </section>
  );
}

export default function ApplicantDashboardPage() {
  const router = useRouter();
  const generateUploadUrl = useMutation(api.registrations.generateImageUploadUrl);
  const [data, setData] = useState<DashboardData | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [applicantNumber, setApplicantNumber] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sideOpen, setSideOpen] = useState(false);
  const [sideCollapsed, setSideCollapsed] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/applicant/me");
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to load dashboard");
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadProfile = useCallback(async () => {
    setIsProfileLoading(true);
    try {
      const response = await fetch("/api/applicant/profile");
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to load profile");
      const registration = payload.registration;
      setProfile({
        ...registration,
        interestSubmissionNumbers: ((registration.interestSubmissionNumbers || []) as Array<string | number>).map((value) => String(value)),
      });
      setUploadedImages(
        ((registration.imageStorageIds || []) as string[]).map((storageId, index) => ({
          storageId,
          url: registration.imageUrls?.[index] || "",
          name: `Uploaded image ${index + 1}`,
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsProfileLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const interestHint = useMemo(() => {
    if (!data) return "";
    return data.applicant.gender === "female"
      ? "Document a male applicant number privately. This is visible only to you and admins before a match."
      : "Submit a female applicant number to send a visible interest for her to review.";
  }, [data]);

  async function runAction(body: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/applicant/interests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Action failed");
      setMessage("Updated.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitNumber(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const number = Number(applicantNumber);
    await runAction({ action: "submit_number", applicantNumber: number });
    setApplicantNumber("");
  }

  async function handleImageUpload(files: FileList | null) {
    if (!files?.length) return;

    const remainingSlots = 3 - uploadedImages.length;
    if (remainingSlots <= 0) {
      setError("You can upload up to 3 images.");
      return;
    }

    setIsUploading(true);
    setMessage(null);
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

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;

    setIsSavingProfile(true);
    setMessage(null);
    setError(null);

    if (uploadedImages.length < 1 || uploadedImages.length > 3) {
      setError("Please upload between 1 and 3 photos.");
      setIsSavingProfile(false);
      return;
    }

    try {
      const response = await fetch("/api/applicant/profile", {
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
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to save profile");
      setMessage("Your profile has been saved.");
      await Promise.all([load(), loadProfile()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function logout() {
    await fetch("/api/applicant/logout", { method: "POST" });
    router.replace("/login");
  }

  function toggleSide() {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches) {
      setSideOpen((open) => !open);
    } else {
      setSideCollapsed((collapsed) => !collapsed);
    }
  }

  if (isLoading && !data) {
    return (
      <main data-admin className="min-h-screen">
        <div className="content">
          <div className="coming-soon">
            <div className="lede">Loading...</div>
          </div>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main data-admin className="min-h-screen">
        <div className="content">
          <p className="notice error">{error ?? "Unable to load dashboard."}</p>
        </div>
      </main>
    );
  }

  const initials = data.applicant.name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const privateCount = data.applicant.gender === "female" ? data.privateDocumented.length : null;
  const completedProfile = data.applicant.profileCompletionStatus === "completed";
  const hijabLabel =
    profile?.gender === "female"
      ? "Do you wear hijab?"
      : "Do you wish for your wife to wear hijab?";

  return (
    <main data-admin>
      <div className={`shell applicant-shell ${sideCollapsed ? "collapsed" : ""}`}>
        <div className={`side-backdrop ${sideOpen ? "open" : ""}`} onClick={() => setSideOpen(false)} />
        <aside className={`side ${sideOpen ? "open" : ""} ${sideCollapsed ? "collapsed" : ""}`}>
          <div className="brand">
            <LogoMark />
            <div>
              <div className="brand-name">Taaruf</div>
              <div className="brand-tag">Applicant</div>
            </div>
          </div>
          <nav className="side-nav">
            <div className="nav-section">
              <h5>Portal</h5>
              <a className="nav-item active" href="#overview" onClick={() => setSideOpen(false)}>
                <span className="icon">{Ico.dash}</span>
                <span>Overview</span>
              </a>
              <a className="nav-item" href="#inbound-interests" onClick={() => setSideOpen(false)}>
                <span className="icon">{Ico.inbox}</span>
                <span>Inbound</span>
                <span className="count">{data.inbound.length}</span>
              </a>
              <a className="nav-item" href="#outbound-interests" onClick={() => setSideOpen(false)}>
                <span className="icon">{Ico.heart}</span>
                <span>Outbound</span>
                <span className="count">{data.outbound.length}</span>
              </a>
              <a className="nav-item" href="#profile" onClick={() => setSideOpen(false)}>
                <span className="icon">{Ico.people}</span>
                <span>Profile</span>
              </a>
              {privateCount !== null && (
                <a className="nav-item" href="#private-documented-interests" onClick={() => setSideOpen(false)}>
                  <span className="icon">{Ico.pipeline}</span>
                  <span>Private</span>
                  <span className="count">{privateCount}</span>
                </a>
              )}
            </div>
            <div className="nav-section">
              <h5>Account</h5>
              <button type="button" className="nav-item" onClick={logout}>
                <span className="icon">{Ico.close}</span>
                <span>Log out</span>
              </button>
            </div>
          </nav>
          <div className="side-foot">
            <div className="avatar">{initials || "A"}</div>
            <div>
              <div style={{ color: "var(--ink)", fontWeight: 500, fontSize: 12 }}>{data.applicant.name}</div>
              <div style={{ fontSize: 10, color: "var(--mute)" }}>
                Applicant #{data.applicant.applicantNumber ?? "-"}
              </div>
            </div>
          </div>
        </aside>

        <div className="main">
          <div className="topbar">
            <button className="hamburger" onClick={toggleSide} aria-label="Toggle menu">
              {Ico.hamburger}
            </button>
            <div className="crumb">
              <span>Taaruf</span>
              <span style={{ color: "var(--line)" }}>›</span>
              <span>Applicant</span>
              <span style={{ color: "var(--line)" }}>›</span>
              <span className="now">Dashboard</span>
            </div>
            <div className="topbar-actions">
              <button type="button" className="btn" onClick={logout}>
                Log Out
              </button>
            </div>
          </div>

          <div id="overview" className="content">
            <div className="page-head">
              <div>
                <h1>
                  Assalāmu <em>ʿalaykum</em>, {data.applicant.name}.
                </h1>
                <p>
                  Applicant #{data.applicant.applicantNumber ?? "-"} · {titleize(data.applicant.gender)} portal
                </p>
              </div>
            </div>

            <div className="stats">
              <div className="stat">
                <h4>Inbound</h4>
                <div className="big">{data.inbound.length}</div>
                <div className="sub">
                  <span>Interests received</span>
                </div>
              </div>
              <div className="stat">
                <h4>Outbound</h4>
                <div className="big">{data.outbound.length}</div>
                <div className="sub">
                  <span>Visible interests sent</span>
                </div>
              </div>
              <div className="stat">
                <h4>{data.applicant.gender === "female" ? "Private" : "Profile"}</h4>
                <div className="big">{data.applicant.gender === "female" ? data.privateDocumented.length : completedProfile ? 1 : 0}</div>
                <div className="sub">
                  <span>
                    {data.applicant.gender === "female"
                      ? "Documented for admins"
                      : titleize(data.applicant.profileCompletionStatus)}
                  </span>
                </div>
              </div>
              <div className="stat">
                <h4>Status</h4>
                <div className="big">{data.inbound.length + data.outbound.length + data.privateDocumented.length}</div>
                <div className="sub">
                  <span>Total interest records</span>
                </div>
              </div>
            </div>

            <div className="panel interest-submit-panel">
              <div className="panel-head">
                <div>
                  <h3>{data.applicant.gender === "female" ? "Document Interest" : "Submit Interest"}</h3>
                  <p>{interestHint}</p>
                </div>
              </div>
              <form onSubmit={submitNumber} className="applicant-number-form">
                <div className="field">
                  <label htmlFor="applicantNumber">Applicant number</label>
                  <input
                    id="applicantNumber"
                    type="number"
                    min="1"
                    inputMode="numeric"
                    value={applicantNumber}
                    onChange={(event) => setApplicantNumber(event.target.value)}
                    placeholder="e.g. 137"
                    required
                  />
                </div>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {Ico.plus}
                  <span>{data.applicant.gender === "female" ? "Document Interest" : "Submit Interest"}</span>
                </button>
              </form>
            </div>

            {message && <p className="notice success">{message}</p>}
            {error && <p className="notice error">{error}</p>}

            <div className="applicant-sections">
              <section id="profile" className="panel applicant-section">
                <div className="panel-head">
                  <div>
                    <h3>Profile</h3>
                    <p>Update the profile details the team uses for matching and bio review.</p>
                  </div>
                  <Pill tone={completedProfile ? "green" : "amber"}>
                    {titleize(data.applicant.profileCompletionStatus)}
                  </Pill>
                </div>
                {isProfileLoading || !profile ? (
                  <div className="coming-soon compact">
                    <div className="lede">Loading profile...</div>
                  </div>
                ) : (
                  <form onSubmit={saveProfile} className="profile-form">
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
                          onChange={(event) => setProfile({ ...profile, prayerCommitment: event.target.value as PrayerCommitment })}
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
                          onChange={(event) => setProfile({ ...profile, hijabResponse: event.target.value as HijabResponse })}
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
                          onChange={(event) => setProfile({ ...profile, photoSharingPermission: event.target.value as PhotoSharingPermission })}
                        >
                          <option value="">Select one</option>
                          {photoSharingOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="photo-upload-box">
                      <div>
                        <h4>Pictures *</h4>
                        <p>Upload up to 3 images. At least 1 is required. Photos are not shared without permission.</p>
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
                      <div className="mono">{isUploading ? "Uploading..." : `${uploadedImages.length} / 3 uploaded`}</div>
                      {uploadedImages.length > 0 && (
                        <div className="photo-grid">
                          {uploadedImages.map((image) => (
                            <div key={image.storageId} className="photo-card">
                              <Image src={image.url} alt={image.name} width={320} height={128} unoptimized />
                              <div>
                                <p>{image.name}</p>
                                <button type="button" className="btn btn-sm" onClick={() => removeImage(image.storageId)}>
                                  Remove
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="profile-grid three">
                      {[0, 1, 2].map((index) => {
                        const keys = ["spouseRequirement1", "spouseRequirement2", "spouseRequirement3"] as const;
                        const key = keys[index];
                        return (
                          <div className="field" key={key}>
                            <label htmlFor={key}>Top spouse requirement {index + 1} *</label>
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
                      <label htmlFor="shareableBio">Shareable bio *</label>
                      <textarea
                        id="shareableBio"
                        value={profile.shareableBio}
                        onChange={(event) => setProfile({ ...profile, shareableBio: event.target.value })}
                        rows={6}
                      />
                    </div>

                    <div className="profile-grid three">
                      {[0, 1, 2].map((index) => (
                        <div key={`interestSubmissionNumber${index + 1}`} className="field">
                          <label htmlFor={`interestSubmissionNumber${index + 1}`}>Interest number {index + 1}</label>
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

                    <div className="field">
                      <label htmlFor="applicantNotesToAdmin">Anything you want the admin team to know?</label>
                      <textarea
                        id="applicantNotesToAdmin"
                        value={profile.applicantNotesToAdmin}
                        onChange={(event) => setProfile({ ...profile, applicantNotesToAdmin: event.target.value })}
                        rows={4}
                        placeholder="Optional note for the admin team"
                      />
                    </div>

                    <div className="profile-actions">
                      <button type="submit" className="btn btn-primary" disabled={isSavingProfile || isUploading}>
                        {isSavingProfile ? "Saving..." : "Save Profile"}
                      </button>
                    </div>
                  </form>
                )}
              </section>

              <Section
                title="Inbound Interests"
                description="People who expressed interest in you."
                interests={data.inbound}
                onAction={runAction}
                busy={busy}
              />
              <Section
                title="Outbound Interests"
                description="Visible interests you sent."
                interests={data.outbound}
                onAction={runAction}
                busy={busy}
              />
              {data.applicant.gender === "female" && (
                <Section
                  title="Private Documented Interests"
                  description="Interests you documented for yourself and the admin team. These are not visible to men before a match."
                  interests={data.privateDocumented}
                  onAction={runAction}
                  busy={busy}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
