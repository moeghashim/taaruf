import { NextRequest } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import { getAdminSecret, privateJson } from "@/lib/admin-server";
import { createToken, hashToken, getApplicantSessionHash } from "@/lib/applicant-session";
import { getConvexClient } from "@/lib/convex";
import { signupUploadCookie } from "@/lib/photo-upload-server";

const MAX_BYTES = 5 * 1024 * 1024;
export async function POST(request: NextRequest) {
  const expectedOrigin = request.nextUrl.protocol + "//" + (request.headers.get("host") || request.nextUrl.host);
  if (request.headers.get("origin") !== expectedOrigin) return privateJson({ error: "Invalid request origin" }, 403);
  try {
    const context = request.headers.get("x-upload-context");
    let capability: string | undefined;
    let credentials: { sessionHash?: string; profileToken?: string; signupCapabilityHash?: string };
    if (context === "signup") {
      capability = request.cookies.get(signupUploadCookie)?.value;
      if (!capability || !/^[A-Za-z0-9_-]{43}$/.test(capability)) capability = createToken();
      credentials = { signupCapabilityHash: hashToken(capability) };
    } else if (context === "profile") {
      credentials = { profileToken: request.headers.get("x-profile-token") || undefined };
    } else if (context === "session") {
      credentials = { sessionHash: await getApplicantSessionHash() || undefined };
    } else return privateJson({ error: "Invalid upload context" }, 400);
    const convex = getConvexClient();
    const adminSecret = getAdminSecret();
    await convex.query(api.photoUploads.authorize, { adminSecret, ...credentials });
    const type = request.headers.get("content-type")?.split(";")[0];
    if (!["image/jpeg", "image/png", "image/webp"].includes(type ?? "")) return privateJson({ error: "Use JPEG, PNG or WebP" }, 415);
    if (Number(request.headers.get("content-length")) > MAX_BYTES) return privateJson({ error: "Image exceeds 5 MB" }, 413);
    const reader = request.body?.getReader();
    if (!reader) return privateJson({ error: "Missing image" }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); return privateJson({ error: "Image exceeds 5 MB" }, 413); }
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks);
    const valid = type === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : type === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      : bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
    if (!valid) return privateJson({ error: "Invalid image content" }, 415);
    // The storage URL and service credential never leave this server.
    const uploadUrl = await convex.mutation(api.registrations.generateImageUploadUrl, { adminSecret });
    const uploaded = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": type! }, body: bytes });
    if (!uploaded.ok) throw new Error("Upload failed");
    const { storageId } = await uploaded.json();
    await convex.mutation(api.photoUploads.record, { adminSecret, storageId, ...credentials });
    const response = privateJson({ storageId });
    if (capability) response.cookies.set(signupUploadCookie, capability, { httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "strict", path: "/", maxAge: 86400 });
    return response;
  } catch {
    return privateJson({ error: "Unable to upload image" }, 400);
  }
}
