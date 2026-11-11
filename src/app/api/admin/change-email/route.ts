import { NextRequest } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { adminRequestError, getAdminSecret, privateJson } from "@/lib/admin-server";
import { getConvexClient } from "@/lib/convex";

export async function POST(request: NextRequest) {
  const denied = adminRequestError(request);
  if (denied) return denied;
  try {
    const body = await request.json();
    if (!body || Object.keys(body).sort().join(",") !== "expectedOldEmail,newEmail,reason,registrationId" || !Object.values(body).every(v => typeof v === "string") || body.newEmail.length > 254 || body.expectedOldEmail.length > 254 || body.reason.length > 500) return privateJson({ error: "Provide the current email, new email and reason." }, 400);
    const result = await getConvexClient().mutation(api.adminEmailChange.change, { ...body, registrationId: body.registrationId as Id<"registrations">, adminSecret: getAdminSecret() });
    return privateJson(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const safe = ["Email changed; refresh the profile", "Email already registered", "Enter a different email", "Invalid email or reason", "Profile not found", "Account scan limit exceeded; manual review required"].find(s => message.includes(s));
    return privateJson({ error: safe ?? "Email could not be changed. Refresh the profile before retrying." }, safe?.startsWith("Email changed") || safe === "Email already registered" ? 409 : 400);
  }
}
