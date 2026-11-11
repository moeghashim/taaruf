import { defineConfig } from "@playwright/test";
export default defineConfig({testDir:"./e2e",testMatch:"inbound3761.spec.ts",workers:1,use:{baseURL:"http://127.0.0.1:3761",channel:"chrome",headless:true},timeout:60000});
