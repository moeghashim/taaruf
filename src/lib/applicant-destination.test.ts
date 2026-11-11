import { expect, test } from "vitest";
import { applicantDestination, applicantLoginHref } from "./applicant-destination";

for (const destination of ["/me", "/dashboard", "/me?connection=abc_123", "/dashboard?femaleReview=review-123"]) test(`canonical applicant destination ${destination}`, () => {
  expect(applicantDestination(destination)).toBe(destination);
  const login = new URL(applicantLoginHref(destination), "https://synthetic.invalid");
  expect(login.pathname).toBe("/login");
  expect(applicantDestination(login.searchParams.get("next"))).toBe(destination);
});

for (const destination of [null, 42, "https://evil.invalid/me", "//evil.invalid/me", "/\\evil.invalid", "\\\\evil.invalid", "/me/../admin", "/admin", "/api/applicant/login/verify?token=secret", "/%2f%2fevil.invalid", "%2f%2fevil.invalid", "/me%3fconnection=id", "/me?connection=%252f", "/me?connection=id#token", "/me?connection=id\n", "/me?connection=", "/me?connection=a&connection=b"]) test(`reject unsafe destination ${JSON.stringify(destination)}`, () => {
  expect(applicantDestination(destination)).toBe("/me");
  expect(applicantLoginHref(destination)).toBe("/login");
});

test("carried destinations omit review tokens and all unrelated query values", () => {
  expect(applicantDestination("/dashboard?femaleReview=review&reviewToken=private-secret&token=login-secret&next=//evil.invalid")).toBe("/dashboard?femaleReview=review");
  expect(applicantLoginHref("/me?connection=interest&token=private-secret")).toBe("/login?next=%2Fme%3Fconnection%3Dinterest");
});

test("preserves inline review destination without accepting review tokens", () => {
  expect(applicantDestination("/me?femaleReview=interest-2#inbound-interests")).toBe("/me?femaleReview=interest-2#inbound-interests");
  expect(applicantDestination("/me?femaleReview=interest-2&reviewToken=secret#inbound-interests")).toBe("/me?femaleReview=interest-2#inbound-interests");
});
