type Stage = "initial" | "workflow-initial" | "final";
/** Explain only the viewer's available action, never the other person's decision. */
export function ReviewNextSteps({ stage, recipientGender }: { stage: Stage; recipientGender?: string }) {
  if (stage !== "final" && (recipientGender === "male" || recipientGender === "female")) return <section className="review-next-steps" aria-label="What happens next">
    <h4>What happens next</h4>
    <p>This applicant has expressed interest in getting to know you better.</p>
    <p>{recipientGender === "male" ? "If you accept, you’ll be able to see her full bio, and she’ll be able to see yours. Accepting does not create a match and does not share any contact details." : "If you accept, you’ll be able to see his full bio, and he’ll be able to see yours. Accepting does not create a match and does not share any contact details."}</p>
    <p>A match is only created after you both read each other’s bios and give your final approval, and the admin approves.</p>
    <p>If you decline, this connection will be closed and no contact details will be shared.</p>
  </section>;
  if (stage === "final") return <section className="review-next-steps" aria-label="What happens next">
    <h4>What happens next</h4>
    <p>If you’re interested after reading their bio, approve to move toward a match and share contact details.</p>
    <p>Your approval alone does not create a match or share contact details. A match is only created once you both approve and the admin approves.</p>
    <p>If you decline, this connection will be closed and no contact details will be shared.</p>
  </section>;
  return <section className="review-next-steps" aria-label="What happens next">
    <h4>What happens next</h4>
    <p>{stage === "initial"
      ? "Accept to continue to the bio review stage. You can then review the bio before giving your final approval. Accepting now does not share contact details."
      : "Accept to unlock the bio, then review it before giving your separate final approval. Initial acceptance is not final approval and does not share contact details."}</p>
    <p>Contact sharing requires both applicants’ agreement and final admin approval.</p>
    <p>Decline closes this connection without sharing contact details.</p>
  </section>;
}
