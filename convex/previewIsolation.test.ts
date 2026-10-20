import { afterEach, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../src/middleware";

afterEach(() => vi.unstubAllEnvs());

test("unisolated previews block reads, writes and magic-login mutations", async () => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("PREVIEW_BACKEND_ISOLATED", "");
  for (const path of ["/api/applicant/me", "/api/admin/share-contacts", "/api/applicant/login/verify?token=test", "/api/stripe/webhook"]) {
    expect(middleware(new NextRequest("https://preview.example" + path)).status).toBe(503);
  }
  expect(middleware(new NextRequest("https://preview.example/api/admin/auth")).status).toBe(200);
});

test("production and explicitly isolated previews preserve normal routing", () => {
  vi.stubEnv("VERCEL_ENV", "production");
  expect(middleware(new NextRequest("https://example.com/api/applicant/me")).status).toBe(200);
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("PREVIEW_BACKEND_ISOLATED", "true");
  expect(middleware(new NextRequest("https://preview.example/api/applicant/me")).status).toBe(200);
});
