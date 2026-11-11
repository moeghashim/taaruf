import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "./e2e", testMatch: "mutual3455.spec.ts", workers: 1, use: { channel: "chrome", baseURL: "http://127.0.0.1:3455" }, outputDir: "test-results/mutual3455" });
