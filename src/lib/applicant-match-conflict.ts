/** Map only the existing transactional guard; never expose participant/match details. */
export const ACTIVE_MATCH_CONFLICT_MESSAGE = "This connection cannot become a match while either participant has another active match. Please contact the team for help.";

export function isApplicantActiveMatchConflict(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message === "Applicant already has an active match" ||
    /(?:^|\n)(?:Uncaught )?Error: Applicant already has an active match(?:\r?\n|$)/.test(error.message);
}
