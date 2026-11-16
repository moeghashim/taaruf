import { expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReviewDecision } from "./review-decision";
const notes = [undefined, null, "both_approved", "awaiting_sister", "awaiting_brother"] as const;
for (const decision of [undefined, "pending", "accepted", "approved", "declined", "withdrawn"]) for (const approvalNote of notes) test(String(decision) + " " + approvalNote, () => {
  const html = renderToStaticMarkup(ReviewDecision({ decision, approvalNote }));
  expect(html.includes("notice success")).toBe(decision === "approved" && !!approvalNote);
  expect(html).not.toContain("after the admin");
  if (decision === "approved" && approvalNote === "both_approved") expect(html).toContain("You’ve both given final approval. Our team will review the match before sharing contact details.");
  if (decision === "approved" && approvalNote?.startsWith("awaiting_")) {
    const sister = approvalNote === "awaiting_sister";
    expect(html).toContain("Your final approval has been recorded. We’re waiting for the " + (sister ? "sister’s" : "brother’s") + " final approval. If " + (sister ? "she" : "he") + " approves, our team will review the match before sharing contact details.");
  }
});
