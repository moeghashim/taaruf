/** Viewer-owned status only; callers retain their existing lifecycle/contact gates. */
export function ReviewDecision({ decision, awaitingAdmin = false }: { decision?: string; awaitingAdmin?: boolean }) {
  if (decision !== "approved" && decision !== "declined") return null;
  return <div className="review-decision">
    <p className="review-decision-label">Your decision: <span className={"pill " + (decision === "approved" ? "green" : "rose")}>{decision}</span>.</p>
    {awaitingAdmin && decision === "approved" && <p className="notice success">Contact details will be shared after the admin reviews and approves the match.</p>}
  </div>;
}
