import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
const base = "http://127.0.0.1:3360";
for (const width of [1280, 390, 320]) test("rejection notice feedback and reversal " + width, async ({page, context}) => {
 await page.setViewportSize({width, height: 900});
 await context.addCookies([{name: "admin_token", value: createHash("sha256").update("synthetic-gracesynthetic-salt").digest("hex"), url: base}]);
 let state = "pending", attempted = false;
 const profile = {_id: "synthetic", _creationTime: 1, publicApplicantNumber: 999, name: "Synthetic Member", email: "synthetic@example.invalid", age: 30, gender: "male", status: "rejected", imageUrls: [], maritalStatus: "single", education: "College", phone: "000"};
 await page.routeWebSocket("**/*", ws => ws.close());
 await page.route("**/*", async route => {
  const u = new URL(route.request().url()); if (u.origin !== base) return route.abort();
  if (!u.pathname.startsWith("/api/")) return route.continue();
  if (u.pathname !== "/api/admin/bridge") return route.fulfill({json: {}});
  const {name, kind, args} = route.request().postDataJSON(); let result: unknown = [];
  if (kind === "mutation") { expect(name).toBe("registrations.updateStatus"); expect(args.status).toBe("approved"); profile.status = "approved"; state = "cancelled"; result = profile._id; }
  else if (name === "registrations.getAll") result = [profile];
  else if (name === "profileRejectionNotice.status") result = {state, attempted, notBefore: 1800000900000};
  else if (name === "events.profileFilterCatalog") result = {page: [], isDone: true, continueCursor: ""};
  else if (name === "interests.getByRegistration") result = {inbound: [], outbound: []};
  return route.fulfill({json: {result}});
 });
 await page.goto(base + "/admin/profiles"); await page.locator("tbody tr").first().click();
 await expect(page.getByText(/Application notice pending — not before/)).toBeVisible();
 await page.getByRole("button", {name: "Reverse rejection and approve profile"}).click();
 await expect(page.getByText(/Application notice cancelled — not sent/)).toBeVisible();
 state = "accepted"; await page.evaluate(() => window.dispatchEvent(new Event("focus")));
 await expect(page.getByText(/Application notice sent — provider accepted/)).toBeVisible();
 state = "pending"; attempted = true; await page.evaluate(() => window.dispatchEvent(new Event("focus")));
 await expect(page.getByText(/Application notice delivery unconfirmed/)).toBeVisible();
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
