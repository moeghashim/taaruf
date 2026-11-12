import { expect, test } from "vitest";
import { portalView, portalViews, portalHashes } from "./applicant-portal-view";
import { applicantDestination, applicantLoginHref } from "./applicant-destination";
test("four distinct canonical views and default overview", () => {
  expect(portalViews.map(view => portalView(view.href))).toEqual(["overview", "interests", "profile", "matchmaker"]);
  expect(portalView("")).toBe("overview");
  expect(portalView("", "?connection=synthetic")).toBe("interests");
  expect(portalView("#overview", "?connection=synthetic")).toBe("overview");
});
for (const hash of portalHashes) test("safe destination survives login: " + hash, () => {
  const destination = "/me?connection=synthetic" + hash;
  expect(applicantDestination(destination)).toBe(destination);
  expect(new URL(applicantLoginHref(destination), "https://example.invalid").searchParams.get("next")).toBe(destination);
});
for (const hash of ["#inbound-interests", "#outbound-interests", "#private-documented-interests"]) test("legacy section " + hash, () => expect(portalView(hash)).toBe("interests"));
for (const destination of ["/me#profile#evil", "/me#unknown", "/dashboard#profile", "/me/evil#profile", "/me#%70rofile"]) test("reject unknown hash " + destination, () => expect(applicantDestination(destination)).toBe("/me"));
