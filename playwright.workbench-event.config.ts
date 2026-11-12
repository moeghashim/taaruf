import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "./e2e", testMatch: "workbench-event.spec.ts", workers: 1, use: { channel: "chrome", baseURL: process.env.WORKBENCH_BASE_URL || "http://127.0.0.1:3143" }, outputDir: process.env.WORKBENCH_TEST_OUTPUT || "test-results/workbench-event" });
