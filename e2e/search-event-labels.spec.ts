import { test, expect } from "@playwright/test";
import crypto from "node:crypto";
for (const width of [1280, 820, 390, 320]) test("aligned search and dated events at " + width, async ({ page, context }, info) => {
  await page.setViewportSize({ width, height: 900 });
  await context.addCookies([{ name: "admin_token", value: crypto.createHash("sha256").update("synthetic-workbenchsynthetic-salt").digest("hex"), url: "http://127.0.0.1:3143" }]);
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname !== "/api/admin/bridge") return route.fulfill({ json: {} });
    const { name, kind } = route.request().postDataJSON();
    expect(kind).toBe("query");
    let result: unknown = [];
    if (name.endsWith("workbenchPage")) result = { page: [], isDone: true, continueCursor: "" };
    if (name === "events.profileFilterCatalog") result = { page: [
      { _id: "a", title: "Real Talk", startsAt: Date.parse("2026-11-15T01:00:00Z") },
      { _id: "b", title: "Real Talk", startsAt: Date.parse("2027-01-01T01:00:00Z") },
      { _id: "c", title: "Legacy event" },
    ], isDone: true, continueCursor: "" };
    return route.fulfill({ json: { result } });
  });
  await page.goto("/admin/workbench");
  const events = page.getByLabel("Filter workbench by event");
  await expect(events.locator("option")).toHaveText(["All events", "No recorded event", "Real Talk — Nov 14, 2026", "Real Talk — Dec 31, 2026", "Legacy event — Date unavailable"]);
  await events.selectOption("b");
  await expect(events).toHaveValue("b");
  const input = page.getByRole("searchbox", { name: "Search profiles" });
  const button = page.getByRole("search").getByRole("button", { name: "Search", exact: true });
  const a = await input.boundingBox(), b = await button.boundingBox();
  expect(a).not.toBeNull(); expect(b).not.toBeNull();
  expect(Math.abs(a!.y - b!.y)).toBeLessThan(2);
  expect(b!.x).toBeGreaterThan(a!.x + a!.width);
  expect(a!.height).toBeGreaterThanOrEqual(44);
  expect(b!.height).toBeGreaterThanOrEqual(44);
  expect(await page.locator("body").evaluate(el => el.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("search-event-labels.png"), fullPage: true });
  await input.fill("  someone+tag@example.com  ");
  await button.click();
  await expect(page).toHaveURL("http://127.0.0.1:3143/admin/profiles?q=someone%2Btag%40example.com");
  await input.fill("555 123 4567");
  await input.press("Enter");
  await expect(page).toHaveURL("http://127.0.0.1:3143/admin/profiles?q=555+123+4567");
  await input.fill("   "); await input.press("Enter");
  await expect(page).toHaveURL("http://127.0.0.1:3143/admin/profiles");
});
