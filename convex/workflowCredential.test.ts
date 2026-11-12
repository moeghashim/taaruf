import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { deliveryConfig } from "./femaleWorkflowDelivery";

beforeEach(() => {
  vi.stubEnv("FEMALE_WORKFLOW_EMAIL_MODE", "brother-final-request-production");
  vi.stubEnv("FEMALE_WORKFLOW_PRODUCTION_APPROVED", "true");
  vi.stubEnv("FEMALE_WORKFLOW_PORTAL_URL", "https://www.1plus1match.com");
  vi.stubEnv("FEMALE_WORKFLOW_EMAIL_FROM", "1Plus1 Match <contact@1plus1match.com>");
  vi.stubEnv("FEMALE_WORKFLOW_EMAIL_CREDENTIAL_SOURCE", undefined);
  vi.stubEnv("FEMALE_WORKFLOW_RESEND_API_KEY", "fake-dedicated");
  vi.stubEnv("RESEND_API_KEY", "fake-shared");
});
afterEach(() => vi.unstubAllEnvs());
test("default remains dedicated and never falls back", () => {
  expect(deliveryConfig("synthetic@example.invalid")?.key).toBe("fake-dedicated");
  vi.stubEnv("FEMALE_WORKFLOW_RESEND_API_KEY", "");
  expect(deliveryConfig("synthetic@example.invalid")).toBeNull();
});
test("explicit shared selection uses only existing shared key", () => {
  vi.stubEnv("FEMALE_WORKFLOW_EMAIL_CREDENTIAL_SOURCE", "shared-resend");
  expect(deliveryConfig("synthetic@example.invalid")?.key).toBe("fake-shared");
  vi.stubEnv("RESEND_API_KEY", "");
  expect(deliveryConfig("synthetic@example.invalid")).toBeNull();
});
for (const mode of [undefined, "disabled", "isolated", "production", "brother-review-production", "sister-confirmation-production", "brother-sister-review-production"]) test("shared rejected outside exact scope: " + mode, () => {
  vi.stubEnv("FEMALE_WORKFLOW_EMAIL_CREDENTIAL_SOURCE", "shared-resend");
  vi.stubEnv("FEMALE_WORKFLOW_EMAIL_MODE", mode);
  vi.stubEnv("FEMALE_WORKFLOW_EMAIL_ALLOWED_RECIPIENTS", "synthetic@example.invalid");
  expect(deliveryConfig("synthetic@example.invalid")).toBeNull();
});
for (const [name, value] of [
  ["FEMALE_WORKFLOW_EMAIL_CREDENTIAL_SOURCE", "typo"],
  ["FEMALE_WORKFLOW_PRODUCTION_APPROVED", "false"],
  ["FEMALE_WORKFLOW_EMAIL_FROM", "Other <other@1plus1match.com>"],
  ["FEMALE_WORKFLOW_EMAIL_FROM", ""],
  ["FEMALE_WORKFLOW_PORTAL_URL", "https://preview.example.invalid"],
  ["FEMALE_WORKFLOW_PORTAL_URL", "http://www.1plus1match.com"],
  ["FEMALE_WORKFLOW_PORTAL_URL", "https://user@www.1plus1match.com"],
]) test("shared fails closed: " + name + value, () => {
  vi.stubEnv("FEMALE_WORKFLOW_EMAIL_CREDENTIAL_SOURCE", "shared-resend");
  vi.stubEnv(name, value);
  expect(deliveryConfig("synthetic@example.invalid")).toBeNull();
});
test("isolated retains dedicated fake credential and recipient allowlist", () => {
  vi.stubEnv("FEMALE_WORKFLOW_EMAIL_MODE", "isolated");
  vi.stubEnv("FEMALE_WORKFLOW_PORTAL_URL", "https://synthetic.example.invalid");
  vi.stubEnv("FEMALE_WORKFLOW_EMAIL_ALLOWED_RECIPIENTS", "synthetic@example.invalid");
  expect(deliveryConfig("synthetic@example.invalid")?.key).toBe("fake-dedicated");
  expect(deliveryConfig("other@example.invalid")).toBeNull();
  vi.stubEnv("FEMALE_WORKFLOW_RESEND_API_KEY", "");
  expect(deliveryConfig("synthetic@example.invalid")).toBeNull();
});
