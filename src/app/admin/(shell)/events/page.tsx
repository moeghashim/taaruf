import { PageHead } from "@/components/admin/layout/page-head";
import { ComingSoon } from "@/components/admin/primitives/coming-soon";

export default function EventsPage() {
  return (
    <>
      <PageHead
        title={<><em>Events</em></>}
        subtitle="Brunches, halaqas, retreats."
      />
      <ComingSoon body="Event scheduling and RSVP management will land in a later phase." />
    </>
  );
}
