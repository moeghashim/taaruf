import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "./e2e", testMatch: ["search-event-labels.spec.ts", "workbench-event.spec.ts"], use: { channel: "chrome", baseURL: "http://127.0.0.1:3143" }, workers: 1 });
