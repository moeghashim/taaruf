import { PageHead } from "@/components/admin/layout/page-head";
import { ComingSoon } from "@/components/admin/primitives/coming-soon";

export default function ProfilesPage() {
  return (
    <>
      <PageHead
        title={<><em>Profiles</em> &amp; registrations</>}
        subtitle="The full registrations table, re-skinned, lands in commit 2."
      />
      <ComingSoon lede="Profiles table arrives next." body="The current /admin dashboard is being refactored into the new shell. View the live data at /admin in the meantime." />
    </>
  );
}
