import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
test.use({ channel: "chrome" });
const base = "http://127.0.0.1:3500";
const evidence = process.env.ISSUE67_EVIDENCE_DIR;
test("Profiles event membership, combined filters, pagination, loading, empty, error and responsive UI", async ({ page, context }) => {
 await context.addCookies([{ name: "admin_token", value: createHash("sha256").update("synthetic-issue67synthetic-salt").digest("hex"), url: base }]);
 const profiles = Array.from({ length: 32 }, (_, i) => ({ _id: "p" + i, _creationTime: 1, publicApplicantNumber: i + 1, name: "Synthetic Member " + i, email: "member" + i + "@example.invalid", phone: "555", age: 30, gender: i % 2 ? "female" : "male", status: i === 3 ? "pending" : "approved", profileCompletionStatus: "completed", imageUrls: [], maritalStatus: "Single", education: "College" }));
 const statuses = ["pending", "approved", "waitlisted", "rejected", "withdrawn"];
 const events = [{ _id: "nov", title: "Synthetic November gathering", startsAt: Date.UTC(2026, 10, 14, 20) }, { _id: "dec", title: "Synthetic December gathering", startsAt: Date.UTC(2026, 11, 12, 20) }, { _id: "empty", title: "Synthetic empty event", startsAt: Date.UTC(2027, 0, 1, 20) }];
 let fail = false;
 await page.route("**/api/**", async route => {
  const body = route.request().postDataJSON();
  expect(body.kind).toBe("query"); // No export, email or mutation is exercised.
  if (body.name === "events.getDetail") {
   if (fail) return route.fulfill({ status: 400, json: { error: "Synthetic error" } });
   await new Promise(resolve => setTimeout(resolve, 300));
   const ids = body.args.eventId === "nov" ? [...Array.from({ length: 30 }, (_, i) => i), 0] : body.args.eventId === "dec" ? [0, 30] : [];
   return route.fulfill({ json: { result: { registrations: ids.map(i => ({ registrationId: "p" + i, registrationStatus: statuses[i % 5], attendanceStatus: "not_checked_in" })) } } });
  }
  return route.fulfill({ json: { result: body.name === "registrations.getAll" ? profiles : body.name === "events.getAll" ? events : null } });
 });
 await page.setViewportSize({ width: 1440, height: 1000 });
 await page.goto(base + "/admin/profiles");
 await expect(page.locator("tbody tr")).toHaveCount(25);
 await page.getByRole("button", { name: "Next", exact: true }).click();
 await expect(page.getByText("Page 2 of 2")).toBeVisible();
 await page.getByLabel("Event registration", { exact: true }).selectOption("nov");
 await expect(page.getByRole("button", { name: "Export CSV" })).toBeDisabled();
 await expect(page.getByText("Page 1 of 2")).toBeVisible();
 await expect(page.getByText("30 shown")).toBeVisible();
 await expect(page.locator("tbody tr")).toHaveCount(25);
 await expect(page.locator("tbody tr").first()).toContainText("Pending");
 if (evidence) await page.screenshot({ path: evidence + "/desktop.png", fullPage: true });
 await page.getByRole("button", { name: "Next", exact: true }).click();
 await expect(page.locator("tbody tr")).toHaveCount(5);
 await page.getByRole("button", { name: "Sisters", exact: true }).click();
 await expect(page.getByText("Page 1 of 1")).toBeVisible();
 await page.getByPlaceholder("Search by name, email, or phone…").fill("member3@");
 await page.getByRole("button", { name: "Pending 1", exact: true }).click();
 await expect(page.locator("tbody tr")).toHaveCount(1);
 await expect(page.locator("tbody tr")).toContainText("Rejected"); // Event status differs from profile approval.
 await page.getByLabel("Event registration", { exact: true }).selectOption("dec");
 await expect(page.getByText("No matches.")).toBeVisible();
 await page.getByPlaceholder("Search by name, email, or phone…").fill("");
 await page.getByRole("button", { name: "All members", exact: true }).click();
 await page.getByRole("button", { name: "All 32", exact: true }).click();
 await expect(page.locator("tbody tr")).toHaveCount(2);
 await page.setViewportSize({ width: 390, height: 844 });
 await page.waitForTimeout(350); // Let the incumbent responsive sidebar transition finish before capture.
 await expect(page.getByLabel("Event registration", { exact: true })).toBeVisible();
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 if (evidence) await page.screenshot({ path: evidence + "/mobile.png", fullPage: true });
 await page.getByLabel("Event registration", { exact: true }).selectOption("empty");
 await expect(page.getByText("No matches.")).toBeVisible();
 fail = true;
 await page.getByLabel("Event registration", { exact: true }).selectOption("nov");
 await expect(page.locator(".panel[role=alert]")).toContainText("Unable to load profiles or event registrations");
 if (evidence) await page.screenshot({ path: evidence + "/error-mobile.png", fullPage: true });
});
test("actual local Next bridge rejects anonymous requests without contacting backend", async ({ request }) => {
 const response = await request.post(base + "/api/admin/bridge", { data: { kind: "query", name: "events.getDetail", args: { eventId: "synthetic" } } });
 expect(response.status()).toBe(401);
});
