import { PageHead } from "@/components/admin/layout/page-head";
import { ComingSoon } from "@/components/admin/primitives/coming-soon";

export default function InterestsPage() {
  return (
    <>
      <PageHead
        title={<>Interest <em>signals</em></>}
        subtitle="Expressions of interest — from members and from our team. Convert promising ones into matches."
      />
      <ComingSoon body="The interests inbox ships once the interests data layer is built out." />
    </>
  );
}
