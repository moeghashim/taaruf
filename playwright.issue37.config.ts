import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "./e2e", use: { baseURL: "http://localhost:3037", headless: true, channel: "chrome" }, workers: 1 });
