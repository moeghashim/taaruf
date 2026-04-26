import { PageHead } from "@/components/admin/layout/page-head";
import { ComingSoon } from "@/components/admin/primitives/coming-soon";

export default function DashboardPage() {
  return (
    <>
      <PageHead
        title={<>Assalāmu <em>ʿalaykum</em>.</>}
        subtitle="Dashboard KPIs and the needs-attention queue ship in the next commit."
      />
      <ComingSoon lede="Dashboard arrives next." body="KPIs, registration pool donuts, and the needs-attention queue land in commit 3." />
    </>
  );
}
