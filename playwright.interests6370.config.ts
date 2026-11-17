import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "./e2e", testMatch: "interests6370.spec.ts", outputDir: "./evidence/interests6370", use: { channel: "chrome", baseURL: "http://127.0.0.1:3170" }, workers: 1 });
