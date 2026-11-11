import { formatEducation } from "@/lib/education";
import { formatHijabResponse } from "@/lib/hijab";

/** Admin comparison projection only; never infer answers from other profile fields. */
export function comparisonProfileDetails(profile: {
  gender?: string;
  ethnicity?: string;
  education?: string;
  hijabResponse?: string;
  maritalStatus?: string;
  prayerCommitment?: string;
  photoSharingPermission?: string;
}) {
  const provided = (value?: string) => value?.trim() || "Not provided";
  const title = (value?: string) => value?.trim()
    ? value.replace(/_/g, " ").replace(/\b\w/g, letter => letter.toUpperCase())
    : "Not provided";
  return [
    // Preserve the existing Background summary separately from explicit Ethnicity.
    { label: "Background", value: provided(profile.ethnicity?.trim() || profile.maritalStatus) },
    { label: "Ethnicity", value: provided(profile.ethnicity) },
    { label: "Education", value: profile.education?.trim() ? formatEducation(profile.education) : "Not provided" },
    { label: "Hijab", value: profile.gender === "male" ? "N/A" : profile.gender === "female" && profile.hijabResponse?.trim() ? formatHijabResponse(profile.hijabResponse, profile.gender) : "Not provided" },
    { label: "Prayer", value: title(profile.prayerCommitment) },
    { label: "Photos", value: title(profile.photoSharingPermission) },
  ];
}
