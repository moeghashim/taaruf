import crypto from "crypto";
import { cookies } from "next/headers";

export const applicantSessionCookie = "applicant_session";

export function createToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function getApplicantSessionHash() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(applicantSessionCookie)?.value;
  return sessionToken ? hashToken(sessionToken) : null;
}

