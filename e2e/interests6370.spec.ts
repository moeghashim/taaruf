import { test, expect } from "@playwright/test";
import crypto from "node:crypto";
const person = (id: number, gender: string, name: string) => ({ _id: String(id), _creationTime: id, publicApplicantNumber: id, gender, name, status: "approved", age: 28, city: "Demo City", imageUrls: [] });
const adam = person(9101, "male", "Synthetic Adam"), sara = person(9102, "female", "Synthetic Sara"), noor = person(9103, "female", "Synthetic Noor"), omar = person(9104, "male", "Synthetic Omar");
const event = { _id: "synthetic-event", title: "Synthetic November event", eventCode: "demo26", startsAt: 1794614400000 };
const base = { _creationTime: 1, eventId: event._id, event, createdAt: 1, updatedAt: 2, source: "platform_submission", visibility: "admin_actionable", match: null, notes: "Synthetic preview — no participant data" };
const fixtures = () => [
 { ...base, _id: "waiting", fromRegistrationId: adam._id, toRegistrationId: sara._id, fromRegistration: adam, toRegistration: sara, status: "new", workbenchReview: { label: "Waiting on sister #9102 — Initial bio decision" } },
 { ...base, _id: "queued", fromRegistrationId: noor._id, toRegistrationId: omar._id, fromRegistration: noor, toRegistration: omar, status: "queued", workbenchReview: { label: "Queued — Admin check — Queue/defer blocker not recorded; Waiting on brother #9104 — Initial bio decision" } },
 { ...base, _id: "closed", fromRegistrationId: sara._id, toRegistrationId: adam._id, fromRegistration: sara, toRegistration: adam, status: "closed", workbenchReview: { label: "Closed — Interest closed" } },
 { ...base, _id: "blocked", fromRegistrationId: omar._id, toRegistrationId: noor._id, fromRegistration: omar, toRegistration: noor, status: "active", workbenchReview: { label: "Blocked — brother #9104 has another active match; Waiting on both — Final approval" } },
];
for (const width of [1440, 390, 320]) test("synthetic composite filters and live counts at " + width, async ({ page, context }, info) => {
 await page.setViewportSize({ width, height: 1000 });
 await context.addCookies([{ name: "admin_token", value: crypto.createHash("sha256").update("synthetic-interestssynthetic-salt").digest("hex"), url: "http://127.0.0.1:3170" }]);
 let rows = fixtures();
 const mutations: string[] = [];
 await page.route("**/*", async route => {
   const url = new URL(route.request().url());
   if (url.hostname !== "127.0.0.1") return route.abort();
   if (!url.pathname.startsWith("/api/")) return route.continue();
   if (url.pathname === "/api/admin/interest-updates") return route.fulfill({ status: 503, json: { error: "Synthetic stream unavailable" } });
   if (url.pathname !== "/api/admin/bridge") return route.fulfill({ json: {} });
   const { name, kind } = route.request().postDataJSON();
   if (kind !== "query") mutations.push(name);
   let result: unknown = [];
   if (name === "interests.getAll") result = rows;
   if (name === "registrations.getAll") result = [adam, sara, noor, omar];
   if (name === "settings.get") result = "Synthetic admin";
   return route.fulfill({ json: { result } });
 });
 await page.goto("/admin/interests");
 const stats = page.getByRole("group", { name: "Global interest counts" });
 await expect(stats.getByRole("button", { name: "Total 4", exact: true })).toBeVisible();
 await expect(page.getByRole("status").filter({ hasText: "4 shown of 4" })).toBeVisible();
 await page.screenshot({ path: info.outputPath("all.png"), fullPage: true });
 await page.getByRole("combobox", { name: "Status", exact: true }).selectOption("open");
 await page.getByRole("combobox", { name: "Open substatus", exact: true }).selectOption("queued");
 await page.getByRole("combobox", { name: "Submitting gender", exact: true }).selectOption("female");
 await page.getByRole("searchbox", { name: "Search interests" }).fill("#9104");
 await expect(page.locator("tbody tr")).toHaveCount(1);
 await expect(stats.getByRole("button", { name: "Total 4", exact: true })).toBeVisible();
 await page.screenshot({ path: info.outputPath("composite.png"), fullPage: true });
 await stats.getByRole("button", { name: "Closed 1", exact: true }).click();
 await expect(page.getByRole("combobox", { name: "Open substatus", exact: true })).toHaveCount(0);
 await expect(page.getByRole("combobox", { name: "Submitting gender", exact: true })).toHaveValue("female");
 await expect(page.getByRole("searchbox", { name: "Search interests" })).toHaveValue("#9104");
 await expect(page.getByText("No interest signals match the current filters.")).toBeVisible();
 await page.getByRole("button", { name: "Clear Filters", exact: true }).click();
 await expect(page.locator("tbody tr")).toHaveCount(4);
 await page.getByRole("searchbox", { name: "Search interests" }).fill("Synthetic Sara");
 await expect(page.locator("tbody tr")).toHaveCount(2);
 // Isolated record change; same authoritative snapshot path, no mutation request.
 rows = rows.map(row => row._id === "waiting" ? { ...row, status: "closed", workbenchReview: { label: "Closed — Interest closed" } } : row);
 await page.evaluate(() => window.dispatchEvent(new Event("admin-data-refresh")));
 await expect(stats.getByRole("button", { name: "Closed 2", exact: true })).toBeVisible();
 await expect(stats.getByRole("button", { name: "Waiting for Approval 0", exact: true })).toBeVisible();
 await expect(page.getByRole("searchbox", { name: "Search interests" })).toHaveValue("Synthetic Sara");
 await stats.getByRole("button", { name: "Total 4", exact: true }).focus();
 await page.keyboard.press("Enter");
 await expect(page.getByRole("searchbox", { name: "Search interests" })).toHaveValue("");
 await expect(page.locator("tbody tr")).toHaveCount(4);
 expect(await page.locator("body").evaluate(el => el.scrollWidth <= innerWidth)).toBe(true);
 expect(mutations).toEqual([]);
});
