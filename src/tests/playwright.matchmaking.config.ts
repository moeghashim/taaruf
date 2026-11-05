import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: ".", testMatch: "matchmaking-preference.spec.ts", use: { headless: true, channel: "chrome" }, workers: 1 });
