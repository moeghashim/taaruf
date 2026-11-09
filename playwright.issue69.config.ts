import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", testMatch: "issue69.spec.ts", workers: 1,
  use: { baseURL: "http://localhost:3510", headless: true, channel: "chrome" },
});
