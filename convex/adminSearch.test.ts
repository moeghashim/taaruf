import { describe, expect, test } from "vitest";
import { profileSearchHref } from "../src/lib/admin-profile-filters";
import { formatHijabResponse } from "../src/lib/hijab";
describe("admin search navigation", () => {
  test("trims and safely encodes names", () => {
    const url = new URL(profileSearchHref("  Amina & Noor + أحمد  "), "https://example.test");
    expect(url.pathname).toBe("/admin/profiles");
    expect(url.searchParams.get("q")).toBe("Amina & Noor + أحمد");
  });
  test("empty search clears filters", () => expect(profileSearchHref("  ")).toBe("/admin/profiles"));
  test("female legacy display differs from male preference", () => {
    expect(formatHijabResponse("open", "female")).toBe("Not yet, but I am working on it");
    expect(formatHijabResponse("open", "male")).toBe("Open");
  });
});
