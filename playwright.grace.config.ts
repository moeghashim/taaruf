import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './e2e', testMatch: 'rejection-grace.spec.ts', workers: 1, use: {channel: 'chrome'}, webServer: {command: 'npm run start -- --port 3360', url: 'http://127.0.0.1:3360', reuseExistingServer: false, env: {ADMIN_PASSWORD: 'synthetic-grace', ADMIN_TOKEN_SALT: 'synthetic-salt', VERCEL_ENV: 'preview'}} });
