import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "./e2e", testMatch: "received3660.spec.ts", workers: 1, use: { baseURL: "http://127.0.0.1:3660", channel: "chrome", headless: true }, timeout: 60000 });
