type Stage = "initial" | "workflow-initial" | "final";
/** Explain only the viewer's available action, never the other person's decision. */
export function ReviewNextSteps({ stage, recipientGender }: { stage: Stage; recipientGender?: string }) {
  if (stage !== "final" && (recipientGender === "male" || recipientGender === "female")) return <section className="review-next-steps" aria-label="What happens next">
    <h4>What happens next</h4>
    <p>This applicant has expressed interest in getting to know you better.</p>
    <p>{recipientGender === "male" ? "If you accept, her full bio will become available for you to review. Accepting does not create a match and does not share any contact details." : "If you accept, his full bio will become available for you to review. Accepting does not create a match and does not share any contact details."}</p>
    <p>{recipientGender === "male" ? "A match is only created after you review her bio and give your final approval, she gives hers, and the admin approves." : "A match is only created after you review his bio and give your final approval, he gives his, and the admin approves."}</p>
    <p>If you decline, this connection will be closed and no contact details will be shared.</p>
  </section>;
  return <section className="review-next-steps" aria-label="What happens next">
    <h4>What happens next</h4>
    <p>{stage === "initial"
      ? "Accept to continue to the bio review stage. You can then review the bio before giving your final approval. Accepting now does not share contact details."
      : stage === "workflow-initial"
        ? "Accept to unlock the bio, then review it before giving your separate final approval. Initial acceptance is not final approval and does not share contact details."
        : "Confirm your interest after reviewing the profile and bio. Your approval does not automatically share contact details."}</p>
    <p>Contact sharing requires both applicants’ agreement and final admin approval.</p>
    <p>Decline closes this connection without sharing contact details.</p>
  </section>;
}
