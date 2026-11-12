import { privateJson } from "@/lib/admin-server";
/** Direct upload URLs cannot establish verified provenance. */
export async function POST() {
  return privateJson({ error: "Use /api/photos/upload with image bytes" }, 410);
}
