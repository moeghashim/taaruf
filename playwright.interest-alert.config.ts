import { defineConfig } from "@playwright/test";
import privacy from "./playwright.privacy.config";
export default defineConfig({ ...privacy, testMatch: ["portal-interest-alert.spec.ts", "female-name-privacy.spec.ts"], workers: 2 });
