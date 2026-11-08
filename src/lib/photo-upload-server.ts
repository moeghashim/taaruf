import { cookies } from "next/headers";
import { hashToken } from "./applicant-session";
export const signupUploadCookie = "signup_photo_upload";
export async function getSignupUploadHash() {
  const token = (await cookies()).get(signupUploadCookie)?.value;
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? hashToken(token) : undefined;
}
