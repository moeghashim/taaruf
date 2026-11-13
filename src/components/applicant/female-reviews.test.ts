// @vitest-environment node
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { FemaleReviews } from "./female-reviews";
const source = readFileSync("src/components/applicant/female-reviews.tsx", "utf8");

test("embedded review mounts without a banner click but discloses no profile or actions before GET", () => {
  const markup = renderToStaticMarkup(createElement(FemaleReviews, { inline: true, interestId: "synthetic-review" }));
  expect(markup).toContain('id="inline-review-synthetic-review"');
  expect(markup).not.toContain("Review profile and respond");
  expect(markup).not.toContain(">Approve<");
  expect(markup).not.toContain(">Decline<");
  expect(markup).not.toContain("Profile details");
  expect(markup).not.toContain("Load more reviews");
});

test("ordinary inline review still requires a selected review", () => {
  const markup = renderToStaticMarkup(createElement(FemaleReviews, { inline: true }));
  expect(markup).not.toContain('aria-label="Selected profile review"');
});

test("embedded review retains authoritative GET and explicit final stage", () => {
  expect(source).toContain('interestId ?? params.get("femaleReview")');
  expect(source).toContain('const params = new URLSearchParams({ interestId: selected })');
  expect(source).toContain('access?.ownAction === "review"');
  expect(source).toContain('const sisterFinal = actionable && access?.role === "sister" && access.ownActionStage === "final"');
  expect(source).not.toContain(">Confirm interest</button>");
  expect(source).toContain('onClick={() => void act({ action: "confirm", interestId: selected, confirmed: true })}>Approve</button>');
  expect(source).toContain('onClick={() => void act({ action: "confirm", interestId: selected, confirmed: false })}>Decline</button>');
});

test("automatically embedded panels do not steal focus", () => {
  expect(source).toContain('interestId && !focusOnSelect');
  expect(source).toContain('focusOnSelect = false');
  expect(source).toContain('(!access && !error) || reviewLoading');
});

test("mounted inactive panels cannot steal contact focus and contacts have scoped IDs", () => {
 expect(source).toContain('if (active && !interestId && contactsReady(access)');
 expect(source).toContain('id={interestId ? "contact-details-" + interestId : "contact-details"}');
});
