import { defineConfig } from "@playwright/test";
export default defineConfig({testDir:"./e2e",testMatch:["inline3765.spec.ts","inbound3761.spec.ts"],workers:1,use:{baseURL:process.env.PORTAL_BASE || "http://127.0.0.1:3765",channel:"chrome",headless:true},timeout:60000});
