import { defineConfig } from "@playwright/test";
export default defineConfig({testDir:"./e2e",testMatch:"overview-events6718.spec.ts",use:{baseURL:"http://127.0.0.1:36718",headless:true,channel:"chrome"},outputDir:"../../privateops/overview6718-browser",workers:1});
