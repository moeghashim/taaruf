import { test, expect } from "@playwright/test";
import crypto from "node:crypto";
for (const width of [1440, 390, 320]) test("admin comparison saved facts and layout " + width, async ({ page, context }, info) => {
 await page.setViewportSize({ width, height: 1000 });
 await context.addCookies([{ name: "admin_token", value: crypto.createHash("sha256").update("synthetic-workbenchsynthetic-salt").digest("hex"), url: "http://127.0.0.1:3428" }]);
 const male = { _id: "male", _creationTime: 1, name: "Synthetic Brother", gender: "male", age: 30, email: "m@example.com", publicApplicantNumber: 901, status: "approved", paymentStatus: "paid", ethnicity: "Arab", education: "md_phd", hijabResponse: "yes", prayerCommitment: "five_and_sunnah", photoSharingPermission: "ask_me_first", dateOfBirth: "1996-01-01" };
 const female = { ...male, _id: "female", name: "Synthetic Sister With A Longer Display Name", gender: "female", publicApplicantNumber: 902, ethnicity: "Mixed background — a longer self-described saved answer to exercise wrapping across multiple lines", education: "associate", hijabResponse: "working_on_it", photoSharingPermission: "no" };
 let missing = false;
 await page.route("**/*", async route => {
 const url = new URL(route.request().url());
 if (url.hostname !== "127.0.0.1") return route.abort();
 if (!url.pathname.startsWith("/api/")) return route.continue();
 if (url.pathname !== "/api/admin/bridge") return route.fulfill({ json: {} });
 const { name, kind } = route.request().postDataJSON();
 expect(kind).toBe("query");
 const f = missing ? { ...female, ethnicity: "", education: "", hijabResponse: "" } : female;
 const match = { _id: "match", maleRegistrationId: "male", femaleRegistrationId: "female", maleRegistration: male, femaleRegistration: f, interest: null, status: "new", interestType: "man_interested" };
 let result: unknown = [];
 if (name === "registrations.getAll") result = [male, f];
 if (name === "events.profileFilterCatalog" || name === "interests.workbenchPage") result = { page: [], isDone: true, continueCursor: "" };
 if (name === "matches.workbenchPage") result = { page: [match], isDone: true, continueCursor: "" };
 return route.fulfill({ json: { result } });
 });
 await page.goto("/admin/workbench?match=match");
 const left = page.getByRole("region", { name: "Requester", exact: true });
 const right = page.getByRole("region", { name: "Target", exact: true });
 const fact = (panel: typeof left, label: string) => panel.locator(".fact").filter({ has: page.locator(".k").getByText(label, { exact: true }) });
 await expect(left).toBeVisible();
 await expect(fact(left, "Ethnicity")).toContainText("Arab");
 await expect(fact(left, "Education")).toContainText("MD/PhD");
 await expect(fact(left, "Hijab")).toContainText("N/A");
 await expect(fact(right, "Education")).toContainText("Associate’s degree");
 await expect(fact(right, "Hijab")).toContainText("Not yet, but I am working on it");
 await expect(left).toContainText("30");
 await expect(left).not.toContainText("1996-01-01");
 for (const label of ["Status", "Payment", "Background", "Ethnicity", "Education", "Hijab", "Prayer", "Photos"]) {
  const a = await fact(left,label).boundingBox(), b = await fact(right,label).boundingBox();
  if (width === 1440) expect(Math.abs(a!.y - b!.y), label + " aligned").toBeLessThan(2);
 }
 if (width < 1000) expect((await right.boundingBox())!.y).toBeGreaterThan((await left.boundingBox())!.y + (await left.boundingBox())!.height);
 expect(await page.locator("body").evaluate(el => el.scrollWidth <= innerWidth)).toBe(true);
 await page.screenshot({ path: info.outputPath("comparison-" + width + ".png"), fullPage: true });
 missing = true;
 await page.evaluate(() => window.dispatchEvent(new Event("admin-data-refresh")));
 for (const label of ["Ethnicity", "Education", "Hijab"]) await expect(fact(right, label)).toContainText("Not provided");
});
test("unauthenticated comparison route and admin API stay protected", async ({ page, request }) => {
 await page.goto("/admin/workbench");
 await expect(page.getByRole("heading", { name: "Admin Access" })).toBeVisible();
 await expect(page.getByRole("region", { name: "Requester", exact: true })).toHaveCount(0);
 const response = await request.post("/api/admin/bridge", { data: { kind: "query", name: "registrations.getAll", args: {} } });
 expect(response.status()).toBe(401);
});
