import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "female-name-privacy.spec.ts",
  use: { baseURL: "http://127.0.0.1:3113", headless: true, browserName: "chromium", channel: "chrome" },
  reporter: "list",
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3113",
    url: "http://127.0.0.1:3113/dashboard",
    reuseExistingServer: false,
    timeout: 120000,
    env: { VERCEL_ENV: "preview", PREVIEW_BACKEND_ISOLATED: "false", ADMIN_PASSWORD: "synthetic-ui-only", ADMIN_TOKEN_SALT: "taaruf-admin-salt" },
  },
});
