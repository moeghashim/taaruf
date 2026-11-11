type Requirements = { spouseRequirement1?: string | null; spouseRequirement2?: string | null; spouseRequirement3?: string | null };

/** Preserve the complete stored answers, including paragraph breaks. */
export function ProfileRequirements({ profile }: { profile: Requirements }) {
  const answers = [profile.spouseRequirement1, profile.spouseRequirement2, profile.spouseRequirement3]
    .filter((answer): answer is string => !!answer?.trim());
  return <section className="profile-requirements" aria-label="Requirements">
    <h4>Requirements</h4>
    {answers.length ? <ul>{answers.map((answer, index) => <li key={index}>{answer}</li>)}</ul>
      : <p>No requirements provided.</p>}
  </section>;
}
