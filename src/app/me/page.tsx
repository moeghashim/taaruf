"use client";
import { DateOfBirthField } from "@/components/date-of-birth-field";
import { dateOfBirthError, changedDateOfBirth } from "@/lib/date-of-birth";
import { educationOptionsFor, formatEducation } from "@/lib/education";

import { portalView, portalViews, type PortalView } from "@/lib/applicant-portal-view";
import { applicantLoginHref } from "@/lib/applicant-destination";
import { hijabQuestion, hijabOptions, formatHijabResponse, type HijabResponse } from "@/lib/hijab";
import { ArchiveParticipant } from "@/components/archive-participant";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ProfileRequirements } from "@/components/applicant/profile-requirements";
import { MatchmakerMatching } from "@/components/applicant/matchmaker-matching";
import { FemaleReviews } from "@/components/applicant/female-reviews";
import { LogoMark } from "@/components/admin/primitives/logo-mark";
import { Ico } from "@/components/admin/primitives/icons";
import { FactList, type Fact } from "@/components/admin/primitives/fact-list";
import { Pill, type Tone } from "@/components/admin/primitives/status-pill";
import { prepareImageFileForUpload } from "@/lib/image-upload";

type DashboardInterest = {
  femaleWorkflow?: boolean;
  interestId: string;
  canPause?: boolean;
  paused?: boolean;
  direction: "inbound" | "outbound" | "private";
  status: string;
  flowStatus: string;
  visibility: string;
  keepOpenExpiresAt: number | null;
  contactSharedAt: number | null;
  ownInitialDecision?: string | null;
  ownFinalApproval: string;
  canRespond: boolean;
  canFinalApprove: boolean;
  canWithdraw: boolean;
  photoDecision: string;
  senderPhotoConsent: "yes" | "no" | null;
  senderPhotoConsentRevokedAt: number | null;
  counterparty: {
    applicantNumber: number | null;
    name?: string;
    age: number;
    gender: string;
    maritalStatus: string | null;
    education: string | null;
    job: string | null;
    ethnicity: string | null;
    prayerCommitment: string | null;
    hijabResponse: string | null;
    spouseRequirement1: string | null;
    spouseRequirement2: string | null;
    spouseRequirement3: string | null;
    photoSharingPermission: string | null;
    imageUrls: string[];
    shareableBio: string | null;
    email: string | null;
    phone: string | null;
    label: string;
    fullProfileVisible: boolean;
  } | null;
};

type DashboardData = {
  eventLogisticsRestricted?: boolean;
  requestedConnectionId?: string | null;
  applicant: {
    status?: string;
    name: string;
    gender: "male" | "female";
    applicantNumber: number | null;
    profileCompletionStatus: string;
    hasPhotos: boolean;
  };
  inbound: DashboardInterest[];
  outbound: DashboardInterest[];
  privateDocumented: DashboardInterest[];
  history?: { interestId: string; status: string; ownDecision: string | null; ownInitialDecision?: string | null; ownFinalApproval?: string }[];
  canSubmitInterest: boolean;
  interestSubmissionLimit: number;
  interestSubmissionEventId: string | null;
  interestSubmissions: { interestId: string; status: string }[];
};

type ApplicantEventData = {
  logisticsRestricted?: boolean;
  upcoming: Array<{
    _id: string;
    title: string;
    location: string;
    startsAt: number;
    endsAt: number;
    status: string;
    registration: null | {
      _id: string;
      registrationStatus: string;
      confirmationStatus: string;
      attendanceStatus: string;
      confirmedAt?: number;
      confirmationRequestedAt?: number;
      confirmationExpiresAt?: number;
    };
  }>;
  history: Array<{
    _id: string;
    registrationStatus: string;
    confirmationStatus: string;
    attendanceStatus: string;
    event: null | {
      title: string;
      startsAt: number;
      location: string;
    };
  }>;
};

type PrayerCommitment = "sometimes" | "strive_five" | "always_five" | "five_and_sunnah" | "";
type PhotoSharingPermission = "yes" | "no" | "ask_me_first" | "";

type UploadedImage = {
  storageId: string;
  url: string;
  name: string;
};

type ProfileImagePayload = {
  storageId: string;
  url: string;
};

type ProfileData = {
  archivedAt?: number | null;
  lastRestoredArchivedAt?: number;
  name: string;
  gender: "male" | "female";
  email: string;
  dateOfBirth?: string;
  education: string;
  ethnicity: string;
  imageStorageIds: string[];
  imageUrls: string[];
  images?: ProfileImagePayload[];
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

const photoSharingOptions = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
] as const;

function uploadedImagesFromProfile(registration: {
  imageStorageIds?: string[];
  imageUrls?: string[];
  images?: ProfileImagePayload[];
}) {
  const images = Array.isArray(registration.images)
    ? registration.images
    : (registration.imageStorageIds || []).map((storageId, index) => ({
        storageId,
        url: registration.imageUrls?.[index] || "",
      }));

  return images
    .filter((image) => image.storageId && image.url)
    .map((image, index) => ({
      storageId: image.storageId,
      url: image.url,
      name: `Uploaded image ${index + 1}`,
    }));
}

const statusTone: Record<string, Tone> = {
  accepted: "green",
  active: "green",
  approved: "green",
  contact_shared: "green",
  converted_to_match: "green",
  declined: "rose",
  closed: "rose",
  awaiting_inbound_response: "amber",
  awaiting_final_approvals: "amber",
  kept_open: "amber",
  bio_review: "blue",
  picture_requested: "blue",
  new: "plain",
};

function titleize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function titleizeValue(value?: string | null) {
  if (!value) return "-";
  return titleize(value);
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

function canConfirmEventRegistration(registration: NonNullable<ApplicantEventData["upcoming"][number]["registration"]>) {
  const confirmationWindowExpired = Boolean(
    registration.confirmationRequestedAt !== undefined &&
      registration.confirmationExpiresAt !== undefined &&
      registration.confirmationExpiresAt < Date.now()
  );

  return Boolean(
      registration.confirmationStatus === "not_confirmed" &&
      !confirmationWindowExpired &&
      (registration.registrationStatus === "pending" ||
        registration.registrationStatus === "approved" ||
        (registration.registrationStatus === "waitlisted" &&
          registration.confirmationRequestedAt !== undefined &&
          registration.confirmationExpiresAt !== undefined))
  );
}

function viewerFinalApprovalFor(interest: DashboardInterest) { return interest.ownFinalApproval; }
function canRespondToInterest(interest: DashboardInterest) { return interest.canRespond; }
function canFinalApproveInterest(interest: DashboardInterest) { return interest.canFinalApprove; }
function canWithdrawInterest(interest: DashboardInterest) { return interest.canWithdraw; }

function canCloseConnection(interest: DashboardInterest) {
  return interest.flowStatus === "contact_shared" || Boolean(interest.contactSharedAt);
}

function profileFactsFor(counterparty: NonNullable<DashboardInterest["counterparty"]>): Fact[] {
  return [
    { label: "Age", value: counterparty.age },
    { label: "Marital", value: titleizeValue(counterparty.maritalStatus) },
    { label: "Education", value: formatEducation(counterparty.education) },
    { label: "Job", value: counterparty.job || "-" },
    { label: "Ethnicity", value: counterparty.ethnicity || "-" },
    { label: "Prayer", value: titleizeValue(counterparty.prayerCommitment) },
    { label: "Hijab", value: formatHijabResponse(counterparty.hijabResponse, counterparty.gender) },
    { label: "Photo permission", value: titleizeValue(counterparty.photoSharingPermission) },
  ];
}

function InterestRow({
  interest,
  selected,
  onSelect,
}: {
  interest: DashboardInterest;
  selected: boolean;
  onSelect: () => void;
}) {
  const counterparty = interest.counterparty;
  const needsAction = canRespondToInterest(interest) || canFinalApproveInterest(interest);

  return (
    <button
      type="button"
      className={`interest-row ${selected ? "selected" : ""}`}
      onClick={onSelect}
      aria-pressed={selected}
      data-interest-id={interest.interestId}
    >
      <div className="interest-row-main">
        <h4>{counterparty?.label ?? "Unknown applicant"}</h4>
        <p>{counterparty ? `${titleize(counterparty.gender)} · age ${counterparty.age}` : "Profile unavailable"}</p>
      </div>
      <div className="interest-row-meta">
        {needsAction && <Pill tone="amber">Action Needed</Pill>}
        <StatusBadge value={interest.flowStatus} />
      </div>
    </button>
  );
}

function ProfileSideCard({
  interest,
  onAction,
  busy,
}: {
  interest: DashboardInterest | null;
  onAction: (body: Record<string, unknown>) => Promise<void>;
  busy: boolean;
}) {
  if (!interest) {
    return (
      <aside className="interest-detail-panel empty">
        <div className="interest-detail-empty">
          <h4>No profile selected</h4>
          <p>Select an interest to review profile details.</p>
        </div>
      </aside>
    );
  }

  const counterparty = interest.counterparty;
  if (!counterparty) {
    return (
      <aside className="interest-detail-panel empty">
        <div className="interest-detail-empty">
          <h4>Profile unavailable</h4>
          <p>This profile could not be loaded.</p>
        </div>
      </aside>
    );
  }

  const viewerFinalApproval =
    viewerFinalApprovalFor(interest);
  const canRespond = canRespondToInterest(interest);
  const canFinalApprove = !interest.paused && canFinalApproveInterest(interest);
  const canWithdraw = canWithdrawInterest(interest);
  const canClose = canCloseConnection(interest);
  const profileFacts = counterparty.fullProfileVisible ? profileFactsFor(counterparty) : [];

  return (
    <aside className="interest-detail-panel">
      <div className="interest-detail-head">
        <div>
          <h3>{counterparty?.label ?? "Unknown applicant"}</h3>
          <p>{titleize(counterparty.gender)}{!counterparty.fullProfileVisible && ` · age ${counterparty.age}`}</p>
        </div>
        <div className="pill-row">
          <StatusBadge value={interest.flowStatus} />
        </div>
      </div>

      {interest.canPause && <button type="button" className="btn" disabled={busy} onClick={() => onAction({ action: interest.paused ? "resume_connection" : "pause_connection", interestId: interest.interestId })}>{interest.paused ? "Resume" : "Pause"}</button>}
      {interest.paused && <p className="notice">This connection is paused.</p>}
      {interest.keepOpenExpiresAt && (
        <p className="notice warning">Keep Open expires {formatDate(interest.keepOpenExpiresAt)}.</p>
      )}

      {interest.ownInitialDecision && interest.ownInitialDecision !== "pending" && <p className="notice">Your initial response: {titleize(interest.ownInitialDecision)}.</p>}
      {viewerFinalApproval === "approved" && interest.flowStatus !== "contact_shared" && (
        <p className="notice success">Your final approval is recorded. Contact details remain private.</p>
      )}

      {(canRespond || canFinalApprove) && (
        <p className="notice warning">This connection is awaiting your review.</p>
      )}

      {interest.flowStatus === "contact_shared" && (
        <p className="notice success">Contact information is available below.</p>
      )}

      {counterparty?.fullProfileVisible && (
        <div className="profile-review-box">
          <h4>Profile details</h4>
          <FactList facts={profileFacts} />
        </div>
      )}

      {counterparty?.fullProfileVisible && (
        <div className="profile-review-box">
          <ProfileRequirements profile={counterparty} />
        </div>
      )}

      {counterparty?.fullProfileVisible && counterparty.imageUrls.length > 0 && (
        <div className="profile-review-box">
          <h4>Photos</h4>
          <div className="photo-grid">
            {counterparty.imageUrls.map((imageUrl, index) => (
              <div key={`${imageUrl}-${index}`} className="photo-card">
                <Image
                  src={imageUrl}
                  alt={`Profile image ${index + 1}`}
                  width={960}
                  height={720}
                  sizes="(max-width: 900px) 100vw, 52vw"
                  unoptimized
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {interest.senderPhotoConsent && <div className="profile-review-box">
        <h4>Your photo sharing for this interest</h4>
        <p>{interest.senderPhotoConsentRevokedAt ? "Revoked" : interest.senderPhotoConsent === "yes" ? "Photo sharing is allowed with this recipient when this interest is visible to them." : "Your photos are private for this interest."}</p>
        {interest.senderPhotoConsent === "yes" && !interest.senderPhotoConsentRevokedAt && <button type="button" className="btn" disabled={busy} onClick={() => onAction({ action: "revoke_photos", interestId: interest.interestId })}>Revoke photo sharing</button>}
        <p>Previously obtained photos or links cannot be recalled.</p>
      </div>}

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

      {canWithdraw && (
        <div className="action-row">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => {
              if (typeof window !== "undefined" && !window.confirm("Withdraw this interest? This cannot be undone.")) return;
              onAction({ action: "withdraw", interestId: interest.interestId });
            }}
          >
            Withdraw
          </button>
        </div>
      )}

      {canClose && (
        <div className="action-row">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => {
              if (typeof window !== "undefined" && !window.confirm("Close this connection and remove this profile from your dashboard?")) return;
              onAction({ action: "close_connection", interestId: interest.interestId });
            }}
          >
            Close Connection
          </button>
        </div>
      )}
    </aside>
  );
}

function Section({
  title,
  description,
  interests,
  requestedConnectionId,
  onAction,
  busy,
}: {
  requestedConnectionId?: string | null;
  title: string;
  description: string;
  interests: DashboardInterest[];
  onAction: (body: Record<string, unknown>) => Promise<void>;
  busy: boolean;
}) {
  const [selectedInterestId, setSelectedInterestId] = useState<string | null>(null);
  const selectedInterest =
    interests.find((interest) => interest.interestId === (selectedInterestId ?? requestedConnectionId)) ?? (requestedConnectionId ? null : interests[0] ?? null);

  useEffect(() => {
    if (!interests.length) {
      setSelectedInterestId(null);
      return;
    }
    if (!selectedInterestId || !interests.some((interest) => interest.interestId === selectedInterestId)) {
      setSelectedInterestId(requestedConnectionId ? interests.find(row => row.interestId === requestedConnectionId)?.interestId ?? null : interests[0].interestId);
    }
  }, [interests, selectedInterestId, requestedConnectionId]);

  useEffect(() => {
    if (!requestedConnectionId || selectedInterest?.interestId !== requestedConnectionId) return;
    const section = document.getElementById(sectionId(title));
    const target = Array.from(section?.querySelectorAll<HTMLButtonElement>("[data-interest-id]") ?? []).find(button => button.dataset.interestId === requestedConnectionId);
    target?.focus();
    target?.scrollIntoView({ block: "center" });
  }, [requestedConnectionId, selectedInterest?.interestId, title]);

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
      <div className={`interest-workspace ${interests.length ? "" : "empty"}`}>
        {interests.length ? (
          <>
            <div className="interest-list">
              {interests.map((interest) => (
                <InterestRow
                  key={interest.interestId}
                  interest={interest}
                  selected={interest.interestId === selectedInterest?.interestId}
                  onSelect={() => setSelectedInterestId(interest.interestId)}
                />
              ))}
            </div>
            <ProfileSideCard interest={selectedInterest} onAction={onAction} busy={busy} />
          </>
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
  const [data, setData] = useState<DashboardData | null>(null);
  const [eventsData, setEventsData] = useState<ApplicantEventData | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [originalDateOfBirth, setOriginalDateOfBirth] = useState<string | undefined>(undefined);
  const [locallyArchivedAt, setLocallyArchivedAt] = useState<number | null | undefined>(undefined);
  const archivedAt = locallyArchivedAt === undefined ? profile?.archivedAt : locallyArchivedAt;
  const archived = archivedAt != null;
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [interestRows, setInterestRows] = useState(() => Array.from({ length: 3 }, () => ({ number: "", name: "" })));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [eligibilityError, setEligibilityError] = useState<string | null>(null);
  const hasDashboard = Boolean(data);
  const [view, setView] = useState<PortalView>("overview");
  const [savedProfile, setSavedProfile] = useState("");
  const profileDirty = Boolean(profile && savedProfile && JSON.stringify({ profile, images: uploadedImages }) !== savedProfile);
  const unsavedRef = useRef(false);
  unsavedRef.current = profileDirty || isUploading || isSavingProfile;
  const [expiredLogin, setExpiredLogin] = useState<string | null>(null);
  // Keep the editor mounted across navigation so Back/Forward never loses edits.
  useEffect(() => {
    const sync = () => { setView(portalView(window.location.hash, window.location.search)); setSideOpen(false); };
    sync();
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => { window.removeEventListener("hashchange", sync); window.removeEventListener("popstate", sync); };
  }, []);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    if (profileDirty || isUploading || isSavingProfile) window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [profileDirty, isUploading, isSavingProfile]);
  useEffect(() => {
    document.title = portalViews.find(item => item.id === view)!.label + " · Taaruf";
  }, [view]);
  const [sideOpen, setSideOpen] = useState(false);
  const [sideCollapsed, setSideCollapsed] = useState(false);

  const applicantFetch = useCallback(async (url: string, init?: RequestInit) => {
    const loginHref = applicantLoginHref(window.location.pathname + window.location.search + window.location.hash);
    const response = await fetch(url, init);
    if (response.status === 401) {
      if (unsavedRef.current) setExpiredLogin(loginHref);
      else router.replace(loginHref);
    }
    return response;
  }, [router]);

  const onMatchmakerSessionExpired = useCallback(() => {
    const href = applicantLoginHref("/me#matchmaker-matching");
    if (unsavedRef.current) setExpiredLogin(href);
    else router.replace(href);
  }, [router]);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const requested = new URLSearchParams(window.location.search).get("connection");
      const response = await applicantFetch("/api/applicant/me" + (requested !== null ? "?connection=" + encodeURIComponent(requested) : ""), { cache: "no-store" });
      if (response.status === 401) {
        return;
      }
      const payload = await response.json();
      if (!response.ok) { setData(null); throw new Error(payload.error || "Failed to load dashboard"); }
      setData({ ...payload, requestedConnectionId: requested });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [applicantFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!hasDashboard || busy) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let active: AbortController | null = null;
    async function refresh() {
      if (stopped || active) return;
      clearTimeout(timer);
      if (document.hidden) { timer = setTimeout(refresh, 3000); return; }
      active = new AbortController();
      try {
        const response = await applicantFetch("/api/applicant/interest-eligibility", { cache: "no-store", signal: active.signal });
        if (stopped) return;
        if (response.status === 401) return;
        if (!response.ok) throw new Error("Availability refresh failed");
        const eligibility = await response.json();
        if (stopped) return;
        setData(current => current ? { ...current, ...eligibility } : current);
        setEligibilityError(null);
      } catch {
        if (!stopped) setEligibilityError("Unable to refresh interest availability. Submitting is paused while we reconnect.");
      } finally {
        active = null;
        if (!stopped) timer = setTimeout(refresh, 3000);
      }
    }
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      stopped = true;
      clearTimeout(timer);
      active?.abort();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
    // Poll only eligibility; do not refetch the profile or write touchSession.
  }, [hasDashboard, busy, applicantFetch]);

  useEffect(() => {
    setInterestRows(Array.from({ length: 3 }, () => ({ number: "", name: "" })));
  }, [data?.interestSubmissionEventId]);

  const loadProfile = useCallback(async () => {
    setIsProfileLoading(true);
    try {
      const response = await applicantFetch("/api/applicant/profile", { cache: "no-store" });
      if (response.status === 401) {
        return;
      }
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to load profile");
      const registration = payload.registration;
      setOriginalDateOfBirth(registration.dateOfBirth);
      const loadedProfile = {
        ...registration,
        interestSubmissionNumbers: ((registration.interestSubmissionNumbers || []) as Array<string | number>).map((value) => String(value)),
      };
      const images = uploadedImagesFromProfile(registration);
      setProfile(loadedProfile);
      setUploadedImages(images);
      setSavedProfile(JSON.stringify({ profile: loadedProfile, images }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsProfileLoading(false);
    }
  }, [applicantFetch]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const loadEvents = useCallback(async () => {
    try {
      const response = await applicantFetch("/api/applicant/events", { cache: "no-store" });
      if (response.status === 401) {
        return;
      }
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to load events");
      setEventsData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [applicantFetch]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);



  async function runAction(body: Record<string, unknown>) {
    if (archived) return false;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await applicantFetch("/api/applicant/interests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) {
        if (response.status === 409) await load();
        throw new Error(payload.error || "Action failed");
      }
      setMessage(body.action === "submit_number" && data?.applicant.gender === "female"
        ? "Your interest has been submitted for admin review. An admin will review it before sharing it with the brother."
        : typeof payload.message === "string" ? payload.message : "Updated.");
      await Promise.all([load(), loadEvents()]);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitNumber(event: React.FormEvent<HTMLFormElement>, index: number) {
    event.preventDefault();
    if (busy || eligibilityError || !data?.canSubmitInterest || !data.interestSubmissionEventId) return;
    const row = interestRows[index];
    if (await runAction({ action: "submit_number", expectedEventId: data.interestSubmissionEventId, applicantNumber: Number(row.number), applicantName: row.name })) {
      setInterestRows(Array.from({ length: 3 }, () => ({ number: "", name: "" })));
    }
  }

  async function registerForEvent(eventId: string) {
    if (archived) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await applicantFetch("/api/applicant/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "register", eventId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Event registration failed");
      setMessage(payload.result?.registrationStatus === "waitlisted"
        ? "You are on this event’s waitlist. A place is not reserved; if one opens, your registration will move to Pending for review."
        : payload.result?.registrationStatus === "pending"
          ? "Event registration received. Your attendance is pending approval."
          : "Your event registration is already recorded. Check its status below.");
      await loadEvents();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirmEventParticipation(eventRegistrationId: string) {
    if (archived) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await applicantFetch("/api/applicant/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm", eventRegistrationId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Event confirmation failed");
      setMessage("Your response has been recorded. Check your event registration status below; confirmation does not grant approval.");
      await loadEvents();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
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
        const result = await applicantFetch("/api/photos/upload", {
          method: "POST",
          headers: {
            "Content-Type": preparedFile.type || "application/octet-stream",
            "x-upload-context": "session",
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
    if (!profile || archived) return;
    const birthdayChange = changedDateOfBirth(profile.dateOfBirth, originalDateOfBirth);
    if (birthdayChange !== undefined) {
      const birthdayError = dateOfBirthError(birthdayChange);
      if (birthdayError) { setError(birthdayError); return; }
    }

    setIsSavingProfile(true);
    setMessage(null);
    setError(null);

    if (profile.photoSharingPermission !== "yes" && profile.photoSharingPermission !== "no") {
      setError("Please choose Yes or No for photo sharing. Your photos remain private until you choose Yes for a permitted recipient.");
      setIsSavingProfile(false);
      return;
    }

    if (uploadedImages.length < 1 || uploadedImages.length > 3) {
      setError("Please upload between 1 and 3 photos.");
      setIsSavingProfile(false);
      return;
    }

    try {
      const response = await applicantFetch("/api/applicant/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ethnicity: profile.ethnicity,
          education: profile.education,
          ...(birthdayChange !== undefined ? { dateOfBirth: birthdayChange } : {}),
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
    if ((profileDirty || isUploading || isSavingProfile) && !window.confirm("Leave without saving your profile changes?")) return;
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
  const completedProfile = data.applicant.profileCompletionStatus === "completed";
  const hijabLabel = hijabQuestion(profile?.gender);
  const actionableInbound = data.inbound.filter(interest => !interest.paused && (interest.canRespond || interest.canFinalApprove));

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
              {portalViews.map(item => <a key={item.id} className={`nav-item ${view === item.id ? "active" : ""}`} href={item.href} aria-current={view === item.id ? "page" : undefined} onClick={() => setSideOpen(false)}>
                <span className="icon">{item.id === "overview" ? Ico.dash : item.id === "profile" ? Ico.people : Ico.heart}</span>
                <span>{item.label}</span>
              </a>)}
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
              <span className="now">{portalViews.find(item => item.id === view)!.label}</span>
            </div>
            <div className="topbar-actions">
              <button type="button" className="btn" onClick={logout}>
                Log Out
              </button>
            </div>
          </div>

          <div className="content">
            <div className="page-head">
              <div>
                <h1>
                  {view === "overview" ? <>Assalāmu <em>ʿalaykum</em>, {data.applicant.name}.</> : portalViews.find(item => item.id === view)!.label}
                </h1>
                <p>
                  Applicant #{data.applicant.applicantNumber ?? "-"} · {titleize(data.applicant.gender)} portal
                </p>
              </div>
            </div>

            {profile && <ArchiveParticipant archivedAt={archivedAt} lastRestoredArchivedAt={profile.lastRestoredArchivedAt} onRestored={() => { setLocallyArchivedAt(null); void load(); void loadEvents(); void loadProfile(); }} onArchived={timestamp => { setLocallyArchivedAt(timestamp); void load(); void loadEvents(); void loadProfile(); }} />}
            <nav className="portal-pages" aria-label="Applicant pages">
              {portalViews.map(item => <a key={item.id} href={item.href} className={`btn ${view === item.id ? "btn-primary" : ""}`} aria-current={view === item.id ? "page" : undefined}>{item.label}</a>)}
            </nav>
            {expiredLogin && <p role="alert" className="notice error">Your session expired. Your unsaved changes remain on this page. <a href={expiredLogin}>Sign in again</a> before continuing; leaving this page will discard unsaved changes.</p>}
            {profileDirty && view !== "profile" && <p className="notice">Your unsaved profile changes are kept here. <a href="#profile">Return to My Profile</a> to save.</p>}
            <div role="status" aria-live="polite" aria-atomic="true">{message && <p className="notice success">{message}</p>}</div>
            {error && <p role="alert" className="notice error">{error}</p>}
            {view === "matchmaker" && <MatchmakerMatching archived={archived} onSessionExpired={onMatchmakerSessionExpired} />}
            <div hidden={view !== "overview"} id="overview">
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
              {data.applicant.gender === "female" && <div className="stat"><h4>Private</h4><div className="big">{data.privateDocumented.length}</div><div className="sub">Documented for admins</div></div>}
              <div className="stat">
                <h4>Status</h4>
                <div className="big">{data.inbound.length + data.outbound.length + data.privateDocumented.length}</div>
                <div className="sub">
                  <span>Total interest records</span>
                </div>
              </div>
            </div>

            <section id="events" className="panel applicant-section">
              <div className="panel-head">
                <div>
                  <h3>Events</h3>
                  <p>{data.eventLogisticsRestricted || eventsData?.logisticsRestricted ? "Event details and registration are unavailable for your profile. Your registration history is retained." : "Register for upcoming events and review your event history."}</p>
                </div>
              </div>
              <div className="interest-list">
                {data.eventLogisticsRestricted || eventsData?.logisticsRestricted || eligibilityError ? (
                  <p role="status">Event details are unavailable.</p>
                ) : (eventsData?.upcoming || []).length ? (
                  eventsData?.upcoming.map((event) => (
                    <div key={event._id} className="interest-row" style={{ alignItems: "center" }}>
                      <div className="interest-row-main">
                        <h4>{event.title}</h4>
                        <p>
                          {formatDate(event.startsAt)} · {event.location}
                        </p>
                      </div>
                      <div className="interest-row-meta">
                        {event.registration ? (
                          <>
                            <StatusBadge value={event.registration.registrationStatus} />
                            {canConfirmEventRegistration(event.registration) ? (
                              <button
                                type="button"
                                className="btn btn-primary"
                                disabled={busy || archived}
                                onClick={() => confirmEventParticipation(event.registration!._id)}
                              >
                                Confirm
                              </button>
                            ) : null}
                          </>
                        ) : (
                          <button type="button" className="btn btn-primary" disabled={busy || archived} onClick={() => registerForEvent(event._id)}>
                            Register
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="coming-soon compact">
                    <div className="lede">No upcoming events.</div>
                  </div>
                )}
              </div>
              {(eventsData?.history || []).length > 0 && (
                <div className="profile-review-box" style={{ marginTop: 16 }}>
                  <h4>Event history</h4>
                  <div className="interest-list">
                    {eventsData?.history.map((row) => (
                      <div key={row._id} className="interest-row">
                        <div className="interest-row-main">
                          <h4>{!data.eventLogisticsRestricted && !eventsData?.logisticsRestricted && !eligibilityError ? row.event?.title ?? "Event" : "Event registration"}</h4>
                          <p>{!data.eventLogisticsRestricted && !eventsData?.logisticsRestricted && !eligibilityError && row.event ? `${formatDate(row.event.startsAt)} · ${row.event.location}` : "Details unavailable"}</p>
                        </div>
                        <div className="interest-row-meta">
                          <StatusBadge value={row.registrationStatus} />
                          <StatusBadge value={row.attendanceStatus} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <p className="portal-next"><a href="#applicant-interests">Review applicant interests</a> · <a href="#profile">Update my profile</a></p>
            </div>
            <div hidden={view !== "interests"} id="applicant-interests">
<<<<<<< HEAD
            {!archived && data.applicant.status === "approved" && <FemaleReviews />}
=======
            {actionableInbound.length > 0 && <section className="interest-invitation" aria-labelledby="inbound-action-heading">
              <div className="interest-invitation-copy">
                <h2 id="inbound-action-heading">You have {actionableInbound.length === 1 ? "an interest to review" : "interests to review"}</h2>
                <p>Review and respond to your incoming interests. Contact details remain private until sharing is approved.</p>
              </div>
              <ul className="interest-invitation-actions">
                {actionableInbound.map((interest, index, actionable) => <li key={interest.interestId}>
                  {actionable.length > 1 && <span>Interest {index + 1}</span>}
                  <a className="btn btn-primary" href={"/me?connection=" + encodeURIComponent(interest.interestId) + "#inbound-interests"} aria-label={actionable.length > 1 ? "View interest " + (index + 1) : undefined}>View interest</a>
                </li>)}
              </ul>
            </section>}
            {data.applicant.status === "approved" && <FemaleReviews />}
>>>>>>> b61ab0f (fix: streamline interest notifications and surface inbound reviews)
            <div className="panel interest-submit-panel">
              <div className="panel-head">
                <div>
                  <h3>Submit Interest</h3>
                  <p aria-live="polite">{!archived && data.canSubmitInterest
                    ? "Enter the applicant's number and first name. Maximum 3 interests per event."
                    : "Interest submissions will open after being approved and checked in for the next event"}</p>
                </div>
              </div>
              {eligibilityError && <p role="status" className="notice error">{eligibilityError}</p>}
              {!archived && data.canSubmitInterest && [0, 1, 2].map(index => {
                const submitted = data.interestSubmissions?.[index];
                return <form key={index} onSubmit={event => submitNumber(event, index)} className="applicant-number-form" aria-label={`Interest ${index + 1}`}>
                  <div className="field">
                    <label htmlFor={`interest-number-${index}`}>Interest {index + 1} · Applicant #</label>
                    <input id={`interest-number-${index}`} type="number" min="1" step="1" inputMode="numeric" required disabled={busy || Boolean(eligibilityError) || Boolean(submitted)}
                      placeholder={submitted ? "Submitted" : "Applicant #"} value={submitted ? "" : interestRows[index].number}
                      onChange={event => setInterestRows(rows => rows.map((row, i) => i === index ? { ...row, number: event.target.value } : row))} />
                  </div>
                  <div className="field">
                    <label htmlFor={`interest-name-${index}`}>First name</label>
                    <input id={`interest-name-${index}`} required maxLength={200} disabled={busy || Boolean(eligibilityError) || Boolean(submitted)} placeholder="First name"
                      value={submitted ? "" : interestRows[index].name}
                      onChange={event => setInterestRows(rows => rows.map((row, i) => i === index ? { ...row, name: event.target.value } : row))} />
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={busy || Boolean(eligibilityError) || Boolean(submitted)}>
                    {submitted ? "Submitted" : "Submit interest"}
                  </button>
                </form>;
              })}
            </div>

            </div>
            <div hidden={view !== "profile"}>
              <section id="profile" className="panel applicant-section">
                <div className="panel-head">
                  <div>
                    <h2>My Profile</h2>
                    <p>Edit your date of birth, education, ethnicity, photos and matching profile here.</p>
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
                    {archived && <p>Archived profile details are read-only.</p>}
                    <fieldset disabled={archived} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
                    <div className="profile-grid two profile-basics">
                    <DateOfBirthField externalHelp originalValue={originalDateOfBirth} value={profile.dateOfBirth} onChange={(dateOfBirth) => setProfile({ ...profile, dateOfBirth })} />
                      <div className="field">
                        <label htmlFor="education">Education level *</label>
                        <select id="education" value={profile.education || ""}
                          onChange={(event) => setProfile({ ...profile, education: event.target.value })} required>
                          <option value="">Select education level</option>
                          {educationOptionsFor(profile.education).map(({ value, label }) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </div>
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
                      <div className="field">
                        <label htmlFor="hijabResponse">{hijabLabel} *</label>
                        <select
                          id="hijabResponse"
                          value={profile.hijabResponse}
                          onChange={(event) => setProfile({ ...profile, hijabResponse: event.target.value as HijabResponse })}
                        >
                          <option value="">Select one</option>
                          {hijabOptions(profile.gender, profile.hijabResponse).map((option) => (
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
                          value={profile.photoSharingPermission === "yes" || profile.photoSharingPermission === "no" ? profile.photoSharingPermission : ""}
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
                    <p id="birthday-help" className="muted">Please add your date of birth for our records and background checks. Only your age is shared with matches.</p>

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
                          onChange={(event) => {
                            void handleImageUpload(event.target.files);
                            event.currentTarget.value = "";
                          }}
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
                    </fieldset>
                  </form>
                )}
              </section>

            </div>
            <div hidden={view !== "interests"} className="applicant-sections">
              {!!data.history?.length && <section className="panel applicant-section" aria-label="Closed connections"><div className="panel-head"><h3>Closed connections</h3></div><div style={{ padding: 20 }}>{data.history.map((item, index) => <div key={item.interestId}><h4>Connection {index + 1}</h4><p>This connection is closed. No further response is needed.</p>{item.ownInitialDecision && item.ownInitialDecision !== "pending" && <p>Your initial response: {titleize(item.ownInitialDecision)}.</p>}{item.ownFinalApproval && item.ownFinalApproval !== "pending" && <p>Your final approval: {titleize(item.ownFinalApproval)}.</p>}{item.ownDecision && item.ownDecision !== "pending" && <p>Your decision: {titleize(item.ownDecision)}.</p>}</div>)}</div></section>}
              <Section
                title="Inbound Interests"
                description="People who expressed interest in you."
                requestedConnectionId={data.requestedConnectionId}
                interests={data.inbound}
                onAction={async body => { await runAction(body); }}
                busy={busy || archived}
              />
              <Section
                title="Outbound Interests"
                description="Visible interests you sent."
                requestedConnectionId={data.requestedConnectionId}
                interests={data.outbound}
                onAction={async body => { await runAction(body); }}
                busy={busy || archived}
              />
              {data.applicant.gender === "female" && (
                <Section
                  title="Private Documented Interests"
                  description="Interests you documented for yourself and the admin team. These remain private until the team creates a recipient-specific review."
                  requestedConnectionId={data.requestedConnectionId}
                  interests={data.privateDocumented}
                  onAction={async body => { await runAction(body); }}
                  busy={busy || archived}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
