import { NextRequest } from "next/server";
import { api } from "../../../../convex/_generated/api";
import { getConvexClient } from "@/lib/convex";
import { getAdminSecret, privateJson } from "@/lib/admin-server";
// Checkout capability reveals payment state only, never registration/profile identity.
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id");
  if (!sessionId || !/^cs_(test|live)_[A-Za-z0-9]{16,240}$/.test(sessionId)) return privateJson({ error: "Invalid checkout reference" }, 400);
  try {
    const registration = await getConvexClient().query(api.registrations.getByStripeSession, { adminSecret: getAdminSecret(), stripeSessionId: sessionId });
    return privateJson({ paymentStatus: registration?.paymentStatus ?? "pending" });
  } catch { return privateJson({ error: "Unable to check payment. Please retry." }, 503); }
}
