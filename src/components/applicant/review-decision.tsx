import type { ApplicantApprovalNote } from "../../../convex/contactGate";

const approvalCopy = {
  both_approved: "You’ve both given final approval. Our team will review the match before sharing contact details.",
  awaiting_sister: "Your final approval has been recorded. We’re waiting for the sister’s final approval. If she approves, our team will review the match before sharing contact details.",
  awaiting_brother: "Your final approval has been recorded. We’re waiting for the brother’s final approval. If he approves, our team will review the match before sharing contact details.",
};
/** Only the canonical server projection authorizes a note; old payloads remain neutral. */
export function ReviewDecision({ decision, approvalNote }: { decision?: string; approvalNote?: ApplicantApprovalNote }) {
  if (decision !== "approved" && decision !== "declined" && decision !== "withdrawn") return null;
  return <div className="review-decision">
    <p className="review-decision-label">Your decision: <span className={"pill " + (decision === "approved" ? "green" : "rose")}>{decision}</span>.</p>
    {approvalNote && decision === "approved" && <p className="notice success">{approvalCopy[approvalNote]}</p>}
  </div>;
}
