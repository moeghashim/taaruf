import { PageHead } from "@/components/admin/layout/page-head";
import { ComingSoon } from "@/components/admin/primitives/coming-soon";

export default function PendingPage() {
  return (
    <>
      <PageHead
        title={<>Pending <em>review</em></>}
        subtitle="Filtered view of registrations awaiting admin approval."
      />
      <ComingSoon lede="Pending queue arrives next." body="Same data as Profiles, preset to status = pending. Lands alongside the Profiles refactor." />
    </>
  );
}
