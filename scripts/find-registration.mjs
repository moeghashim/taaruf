import { ConvexHttpClient } from "convex/browser";
import fs from "fs";
import path from "path";

const envPath = path.resolve(process.cwd(), ".env.prod");
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}

const needle = (process.argv[2] || "").toLowerCase();
const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);
const all = await convex.query("registrations:getAll", {});
const matches = all.filter((r) =>
  needle ? (r.email || "").toLowerCase().includes(needle) || (r.name || "").toLowerCase().includes(needle) : false
);

if (matches.length === 0) {
  console.log(`No registrations matching "${needle}". Recent 10:`);
  const recent = [...all].sort((a, b) => b._creationTime - a._creationTime).slice(0, 10);
  for (const r of recent) {
    console.log(`  ${r.name} <${r.email}>  status=${r.status}  payment=${r.paymentStatus}`);
  }
} else {
  for (const r of matches) {
    console.log(`${r.name} <${r.email}>  status=${r.status}  payment=${r.paymentStatus}  _id=${r._id}`);
  }
}
