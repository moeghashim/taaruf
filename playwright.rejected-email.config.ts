import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "./e2e", testMatch: "rejected-event-email.spec.ts", use: { channel: "chrome", baseURL: process.env.TEST_BASE_URL ?? "http://127.0.0.1:3157" }, workers: 1 });
