import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir:"./e2e", testMatch:"rejected-logistics.spec.ts", workers:1, use:{ launchOptions:{ executablePath:process.env.LOGISTICS_BROWSER_PATH } } });
