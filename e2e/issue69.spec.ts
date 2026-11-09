import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";

// Synthetic serialized transport responses only. Never contact a live backend.
const fixtures = JSON.parse(JSON.stringify([
  { _id: "synthetic-populated", ethnicity: "Synthetic heritage / mixed" },
  { _id: "synthetic-empty", ethnicity: "" },
  { _id: "synthetic-absent" },
  { _id: "synthetic-whitespace", ethnicity: "   " },
])).map((entry: { _id: string; ethnicity?: string }, index: number) => ({
  ...entry, _creationTime: 1700000000000 + index, publicApplicantNumber: index + 1,
  name: "Synthetic " + index, email: "fixture" + index + "@example.invalid",
  age: 30, gender: "female", status: "pending", maritalStatus: "Single", imageUrls: [],
}));

for (const width of [1440, 390]) {
  test(`ethnicity remains visible in list and detail at ${width}px`, async ({ page, context }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await context.addCookies([{
      name: "admin_token", value: createHash("sha256").update("synthetic-issue69synthetic-local-only").digest("hex"),
      domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax",
    }]);
    const unexpected: string[] = [];
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.hostname !== "localhost") return route.abort();
      if (!url.pathname.startsWith("/api/")) return route.continue();
      if (url.pathname !== "/api/admin/bridge") {
        unexpected.push(url.pathname);
        return route.fulfill({ status: 503, json: { error: "Unexpected API blocked" } });
      }
      const { kind, name } = route.request().postDataJSON();
      expect(kind).toBe("query");
      let result: unknown = [];
      if (name === "registrations.getAll") result = fixtures;
      else if (name === "interests.getByRegistration") result = { inbound: [], outbound: [] };
      return route.fulfill({ json: { result } });
    });
    await page.goto("/admin/profiles");
    const header = page.getByRole("columnheader", { name: "Ethnicity", exact: true });
    await expect(header).toBeVisible();
    await expect(header).toHaveAttribute("scope", "col");
    await header.scrollIntoViewIfNeeded();
    await expect(header).toBeInViewport();
    for (const [index, fixture] of fixtures.entries()) {
      const row = page.getByRole("row").filter({ hasText: fixture.email });
      const expected = index === 0 ? fixture.ethnicity : "Not provided";
      const cell = row.getByRole("cell").nth(3);
      await expect(cell).toHaveText(expected!);
      await cell.scrollIntoViewIfNeeded();
      await expect(cell).toBeVisible();
      await expect(cell).toBeInViewport();
    }
    await page.screenshot({ path: testInfo.outputPath(`list-${width}.png`), fullPage: true });
    for (const [index, fixture] of fixtures.entries()) {
      // Query-driven detail opening uses the actual production page, hook and drawer.
      await page.goto("/admin/profiles?profile=" + fixture._id);
      const fact = page.locator(".fact").filter({ has: page.locator(".k", { hasText: /^Ethnicity$/ }) });
      await expect(fact.locator(".v")).toHaveText(index === 0 ? fixture.ethnicity! : "Not provided");
      await fact.scrollIntoViewIfNeeded();
      await expect(fact).toBeVisible();
      await expect(fact).toBeInViewport();
      expect(await fact.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`detail-${index}-${width}.png`), fullPage: true });
    }
    expect(unexpected).toEqual([]);
  });
}
