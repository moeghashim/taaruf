export function isApplicantUnauthorized(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message === "Unauthorized" || /(?:^|\n)(?:Uncaught )?Error: Unauthorized(?:\r?\n|$)/.test(error.message);
}
