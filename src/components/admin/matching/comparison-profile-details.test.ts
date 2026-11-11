import { describe, expect, it } from "vitest";
import { comparisonProfileDetails } from "./comparison-profile-details";
import { educationOptions } from "@/lib/education";
import { hijabOptions } from "@/lib/hijab";
const values = (profile: Parameters<typeof comparisonProfileDetails>[0]) => Object.fromEntries(comparisonProfileDetails(profile).map(row => [row.label, row.value]));
describe("admin comparison saved answers", () => {
  it("does not infer ethnicity from background, religion or other fields", () => {
    expect(values({ maritalStatus: "single" }).Ethnicity).toBe("Not provided");
    expect(values({ ethnicity: "  Arab / South Asian  " }).Ethnicity).toBe("Arab / South Asian");
  });
  it.each(educationOptions)("uses shared education label $value", option => {
    expect(values({ education: option.value }).Education).toBe(option.label);
  });
  it.each(hijabOptions("female", "open"))("uses shared female hijab label $value", option => {
    expect(values({ gender: "female", hijabResponse: option.value }).Hijab).toBe(option.label);
  });
  it("uses N/A only for inapplicable male practice, not his spouse preference", () => {
    expect(values({ gender: "male", hijabResponse: "yes" }).Hijab).toBe("N/A");
    expect(values({ gender: "female" }).Hijab).toBe("Not provided");
    expect(values({ hijabResponse: "yes" }).Hijab).toBe("Not provided");
  });
  it("handles missing/blank and preserves unknown historic strings", () => {
    expect(Object.values(values({}))).toEqual(Array(6).fill("Not provided"));
    expect(values({ ethnicity: " ", education: " ", gender: "female", hijabResponse: " " }).Hijab).toBe("Not provided");
    expect(values({ education: "Historic answer" }).Education).toBe("Historic answer");
  });
  it("retains background prayer and photo permission", () => {
    expect(values({ maritalStatus: "single", prayerCommitment: "five_and_sunnah", photoSharingPermission: "ask_me_first" })).toMatchObject({ Background: "single", Prayer: "Five And Sunnah", Photos: "Ask Me First" });
  });
  it("projects only six display facts, excluding private fields", () => {
    const profile = { ethnicity: "Arab", dateOfBirth: "1990-01-01", adminNotes: "PRIVATE", backgroundCheckDetails: "SECRET" };
    const rows = comparisonProfileDetails(profile);
    expect(rows.map(row => row.label)).toEqual(["Background", "Ethnicity", "Education", "Hijab", "Prayer", "Photos"]);
    expect(JSON.stringify(rows)).not.toMatch(/PRIVATE|SECRET|1990/);
  });
});
