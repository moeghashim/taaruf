import { PageHead } from "@/components/admin/layout/page-head";
import { ComingSoon } from "@/components/admin/primitives/coming-soon";

export default function SettingsPage() {
  return (
    <>
      <PageHead
        title={<><em>Settings</em></>}
        subtitle="Slot caps, payment reconciliation, and admin display name."
      />
      <ComingSoon lede="Settings re-skin lands in commit 5." body="The existing slot-cap controls and payment reconciliation will be ported into the new shell." />
    </>
  );
}
