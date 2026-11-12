import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir:"./e2e", testMatch:"event-waitlists.spec.ts", use:{baseURL:"http://127.0.0.1:3107", headless:true, browserName:"chromium", channel:"chrome"}, reporter:"list" });
