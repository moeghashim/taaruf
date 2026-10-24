import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "./e2e", testMatch: "education.spec.ts", outputDir: "../education-browser-results", use: { channel: "chrome", baseURL: "http://127.0.0.1:3187" }, webServer: { command: "npm run start -- --port 3187", url: "http://127.0.0.1:3187", reuseExistingServer: false } });
