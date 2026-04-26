import { PageHead } from "@/components/admin/layout/page-head";
import { ComingSoon } from "@/components/admin/primitives/coming-soon";

export default function PipelinePage() {
  return (
    <>
      <PageHead
        title={<>Matching <em>pipeline</em></>}
        subtitle="Kanban board of matches across stages — new → reviewing → contact shared → paused → closed."
      />
      <ComingSoon body="The pipeline view ships once the matches data layer is built out. Drag-and-drop is intentionally deferred to v2." />
    </>
  );
}
