import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "./e2e", testMatch: ["participant-event-status.spec.ts", "event-waitlists.spec.ts"], workers: 1, use: { baseURL: "http://127.0.0.1:3550", headless: true, browserName: "chromium", channel: "chrome" }, reporter: "list" });
