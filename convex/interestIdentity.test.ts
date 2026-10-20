import { expect, test } from "vitest";
import { matchesInterestFirstName as match } from "./interestIdentity";
test("first-name normalization is exact, not fuzzy", () => {
 expect(match("Élodie Smith", " e\u0301LODIE ")).toBe(true);
 expect(match("Mary-Jane Smith", "MARY-JANE")).toBe(true);
 for (const name of ["Mary", "Smith", "Mary-Jane Smith", ""]) expect(match("Mary-Jane Smith", name)).toBe(false);
 expect(match("Élodie Smith", "Elodie")).toBe(false);
});
