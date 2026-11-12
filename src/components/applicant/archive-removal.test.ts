// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
test("participant portal omits archive and exact DOB helper, retains DOB editor", () => {
 const source = readFileSync("src/app/me/page.tsx", "utf8");
 expect(source).not.toContain("ArchiveParticipant");
 expect(source).not.toContain("Please add your date of birth for our records and background checks. Only your age is shared with matches.");
 expect(source).toContain("<DateOfBirthField hideHelp");
 expect(source).toContain("<MatchmakerMatching");
 expect(source).toContain("withdrawEventParticipation");
});
