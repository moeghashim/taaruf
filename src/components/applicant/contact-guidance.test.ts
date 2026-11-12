import { expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ContactGuidance } from "./contact-guidance";

test("brother receives exact bold heading and sister contact guidance", () => {
  expect(renderToStaticMarkup(ContactGuidance({ viewerGender: "male" }))).toBe("<p><strong>Bismillah — reach out today!</strong></p><p>The sister’s contact details are below. Make your intention, reach out with a respectful introduction, and may Allah put khayr in it.</p>");
});
test("sister receives exact expectation without brother-only heading", () => {
  expect(renderToStaticMarkup(ContactGuidance({ viewerGender: "female" }))).toBe("<p>The brother’s contact details are below. Please expect him to reach out to you with a respectful introduction. May Allah put khayr in it.</p>");
});
for (const viewerGender of [undefined, "", "unknown"]) test("no guessed gender guidance: " + viewerGender, () => {
  expect(ContactGuidance({ viewerGender })).toBeNull();
});
