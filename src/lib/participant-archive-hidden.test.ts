import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source = (path: string) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");
describe("participant archive UI hidden", () => {
  it("does not mount the shared archive/restore control in any portal view", () => {
    const page = source("src/app/me/page.tsx");
    expect(page).not.toContain("ArchiveParticipant");
    expect(page).not.toContain("/api/applicant/archive");
    expect(page).not.toContain("/api/applicant/restore");
    expect(page).toContain("const archivedAt = profile?.archivedAt");
    expect(page).toContain("Archived profile details are read-only.");
    expect(page).toContain("withdrawEventParticipation(event.registration!._id)");
    expect(page).toContain("<MatchmakerMatching");
  });
  it("retains admin archive/restore entry and shared component", () => {
    expect(source("src/components/admin/profiles/profile-detail.tsx")).toContain("registrationId={profile._id}");
    expect(source("src/components/admin/profiles/profile-detail.tsx")).toContain("<ArchiveParticipant");
    expect(source("src/components/archive-participant.tsx")).toContain("Restore availability");
  });
});
