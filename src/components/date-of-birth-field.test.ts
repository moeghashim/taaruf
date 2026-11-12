import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";
import { DateOfBirthField } from "./date-of-birth-field";
import { RegistrationForm } from "./registration-form";
afterEach(() => vi.useRealTimers());
test("signup uses required native date control and privacy copy instead of numeric age", () => {
  const html = renderToStaticMarkup(createElement(RegistrationForm));
  expect(html).toContain('type="date"'); expect(html).toContain('autoComplete="bday"');
  expect(html).toMatch(/type="date"[^>]*required/); expect(html).not.toContain('id="age"');
  expect(html).toContain("not your date of birth");
});
test("owner editor prefills known birthday; unknown legacy birthday remains empty", () => {
  for (const value of [undefined, "1990-01-02"]) {
    const html = renderToStaticMarkup(createElement(DateOfBirthField, { value, onChange: vi.fn() }));
    expect(html).toContain('value="' + (value ?? "") + '"');
    expect(html).toContain('aria-invalid="false"');
    expect(html).toContain("Only your age is shared with matches");
  }
});
test("owner editor gives accessible errors for minor and cleared birthday", () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-11T02:00:00Z"));
  for (const value of ["2010-01-01", ""]) {
    const html = renderToStaticMarkup(createElement(DateOfBirthField, { value, originalValue: "1990-01-02", onChange: vi.fn() }));
    expect(html).toContain('aria-invalid="true"'); expect(html).toContain('aria-live="polite"');
  }
});

test("owner field allows cleared legacy blank and unchanged age 100 but rejects changed age 100", () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-11T02:00:00Z"));
  for (const [value, originalValue, invalid] of [
    ["", undefined, false], ["1926-11-10", "1926-11-10", false],
    ["1926-11-09", "1926-11-10", true], ["", "1926-11-10", true],
  ] as const) {
    const html = renderToStaticMarkup(createElement(DateOfBirthField, { value, originalValue, onChange: vi.fn() }));
    expect(html).toContain('aria-invalid="' + invalid + '"');
  }
});
