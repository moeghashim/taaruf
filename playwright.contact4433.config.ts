import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "./e2e", testMatch: "contact4433.spec.ts", workers: 2, use: { baseURL: process.env.CONTACT_TEST_ORIGIN || "http://127.0.0.1:4433", channel: "chrome", headless: true, serviceWorkers: "block" }, timeout: 30000 });
