import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "./e2e", testMatch: "comparison3428.spec.ts", workers: 1, use: { channel: "chrome", baseURL: "http://127.0.0.1:3428" }, outputDir: process.env.COMPARISON_TEST_OUTPUT || "test-results/comparison3428" });
