import { ProfilesPageClient } from "@/components/admin/profiles/profiles-page-client";

export default function PendingPage() {
  return (
    <ProfilesPageClient
      title={<>Pending <em>review</em></>}
      subtitle="Filtered view of registrations awaiting admin approval."
      initialStatus="pending"
      lockStatus
    />
  );
}
