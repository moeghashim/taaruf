import { PageHead } from "@/components/admin/layout/page-head";
import { ComingSoon } from "@/components/admin/primitives/coming-soon";

export default function WorkbenchPage() {
  return (
    <>
      <PageHead
        title={<>Match <em>workbench</em></>}
        subtitle="Compose, review, and advance introductions between members."
      />
      <ComingSoon body="The matching workbench will surface side-by-side profile comparison, compatibility scoring, and an action bar once the matches data layer is built out." />
    </>
  );
}
