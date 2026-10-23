import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import { getConvexClient } from "../../../../lib/convex";
function authorized(request: NextRequest) {
  if (!process.env.ADMIN_PASSWORD) return false;
  const expected = crypto.createHash("sha256").update(process.env.ADMIN_PASSWORD + (process.env.ADMIN_TOKEN_SALT || "taaruf-admin-salt")).digest("hex");
  return request.cookies.get("admin_token")?.value === expected;
}
export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const adminSecret = process.env.ATTENDANCE_ADMIN_SECRET;
  if (!adminSecret) return NextResponse.json({ error: "Event service not configured" }, { status: 503 });
  try {
    const { action, ...body } = await request.json();
    const client = getConvexClient();
    // Convex validates each action's exact arguments. Never forward a client secret.
    const args = { ...body, adminSecret };
    let result;
    switch (action) {
      case "create": result = await client.mutation(api.events.create, args); break;
      case "deleteEvent": result = await client.mutation(api.events.deleteEvent, args); break;
      case "updateRegistrationStatus": result = await client.mutation(api.events.updateRegistrationStatus, args); break;
      case "updateRegistrationConfirmation": result = await client.mutation(api.events.updateRegistrationConfirmation, args); break;
      case "requestConfirmation": result = await client.mutation(api.events.requestConfirmation, args); break;
      case "carryOverRegistrations": result = await client.mutation(api.events.carryOverRegistrations, args); break;
      case "addRegistration": result = await client.mutation(api.events.addRegistration, args); break;
      case "update": result = await client.mutation(api.events.update, args); break;
      default: return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
    return NextResponse.json({ success: true, result });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update event" }, { status: 400 }); }
}
