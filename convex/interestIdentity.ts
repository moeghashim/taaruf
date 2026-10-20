// Names have no structured given-name field: use the first whitespace-delimited token.
// Preserve accents, apostrophes and hyphens; never fuzzy-match or strip punctuation.
export function normalizeInterestName(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}
export function matchesInterestFirstName(fullName: string, supplied: string) {
  return supplied.length <= 200 && Boolean(supplied.trim()) &&
    normalizeInterestName(fullName).split(" ")[0] === normalizeInterestName(supplied);
}
