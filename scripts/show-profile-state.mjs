import { ConvexHttpClient } from "convex/browser";
import fs from "fs";
import path from "path";

const envPath = path.resolve(process.cwd(), ".env.prod");
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}

const targetEmail = process.argv[2];
if (!targetEmail) {
  console.error("usage: node scripts/show-profile-state.mjs <email>");
  process.exit(1);
}

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);
const all = await convex.query("registrations:getAll", {});
const r = all.find((x) => (x.email || "").toLowerCase() === targetEmail.toLowerCase());
if (!r) {
  console.error("not found");
  process.exit(1);
}

const required = [
  ["ethnicity", (v) => typeof v === "string" && v.trim().length > 0],
  ["prayerCommitment", (v) => ["sometimes", "strive_five", "always_five", "five_and_sunnah"].includes(v)],
  ["hijabResponse", (v) => ["yes", "no", "open"].includes(v)],
  ["spouseRequirement1", (v) => typeof v === "string" && v.trim().length > 0],
  ["spouseRequirement2", (v) => typeof v === "string" && v.trim().length > 0],
  ["spouseRequirement3", (v) => typeof v === "string" && v.trim().length > 0],
  ["shareableBio", (v) => typeof v === "string" && v.trim().length > 0],
  ["photoSharingPermission", (v) => ["yes", "no", "ask_me_first"].includes(v)],
  ["imageStorageIds (1-3)", (v) => Array.isArray(v) && v.length >= 1 && v.length <= 3],
];

console.log(`${r.name} <${r.email}>`);
console.log(`  status:                  ${r.status}`);
console.log(`  paymentStatus:           ${r.paymentStatus}`);
console.log(`  profileCompletionStatus: ${r.profileCompletionStatus ?? "(unset)"}`);
console.log("");
console.log("Required fields:");
for (const [name, check] of required) {
  const key = name.split(" ")[0];
  const value = r[key];
  const ok = check(value);
  let display;
  if (Array.isArray(value)) display = `[${value.length} item${value.length === 1 ? "" : "s"}]`;
  else if (typeof value === "string") display = value.length > 50 ? value.slice(0, 50) + "…" : value;
  else display = String(value);
  console.log(`  ${ok ? "✓" : "✗"} ${name.padEnd(28)} ${display}`);
}
