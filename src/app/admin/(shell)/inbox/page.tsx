import { PageHead } from "@/components/admin/layout/page-head";
import { ComingSoon } from "@/components/admin/primitives/coming-soon";

export default function InboxPage() {
  return (
    <>
      <PageHead
        title={<><em>Inbox</em></>}
        subtitle="Emails, interests, and member questions in one place."
      />
      <ComingSoon body="The inbox surface will arrive after the matching pipeline is stable." />
    </>
  );
}
