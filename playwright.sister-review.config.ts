import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", testMatch: "sister-admin-review.spec.ts", workers: 2,
  use: { baseURL: "http://127.0.0.1:3128", headless: true, browserName: "chromium", channel: "chrome" },
  reporter: "list",
  webServer: { command: "npx next dev --hostname 127.0.0.1 --port 3128", url: "http://127.0.0.1:3128/me", reuseExistingServer: false, timeout: 120000,
    env: { VERCEL_ENV: "preview", PREVIEW_BACKEND_ISOLATED: "false" } },
});
