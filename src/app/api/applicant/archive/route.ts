import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Retired participant endpoint: stale clients must never reach a mutation.
export async function POST() {
  return NextResponse.json(
    { error: "Participant archive and restore are managed by the admin team." },
    { status: 403, headers: { "Cache-Control": "no-store" } },
  );
}
