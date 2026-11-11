type Stage = "initial" | "workflow-initial" | "final";
/** Explain only the viewer's available action, never the other person's decision. */
export function ReviewNextSteps({ stage }: { stage: Stage }) {
  return <section className="review-next-steps" aria-label="What happens next">
    <h4>What happens next</h4>
    <p>{stage === "initial"
      ? "Accept to continue to the bio review stage. You can then review the bio before giving your final approval. Accepting now does not share contact details."
      : stage === "workflow-initial"
        ? "Accept to record your approval and continue the connection review. The bio becomes available after this initial acceptance. Accepting does not share contact details."
        : "Confirm your interest after reviewing the profile and bio. Your approval does not automatically share contact details."}</p>
    <p>Contact sharing requires both applicants’ agreement and final admin approval.</p>
    <p>Decline closes this connection without sharing contact details.</p>
  </section>;
}
