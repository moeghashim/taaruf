import { NextRequest, NextResponse } from "next/server";
export function archiveOriginAllowed(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || request.headers.get("sec-fetch-site") === "cross-site") return false;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === request.nextUrl.protocol && parsed.host === (request.headers.get("host") || request.nextUrl.host);
  } catch { return false; }
}
export function validArchiveBody(body: unknown): body is { confirm: true; expectedArchivedAt: number | null } {
  if (!body || typeof body !== "object") return false;
  const value = body as Record<string, unknown>;
  return value.confirm === true && (value.expectedArchivedAt === null ||
    (typeof value.expectedArchivedAt === "number" && Number.isFinite(value.expectedArchivedAt) && value.expectedArchivedAt >= 0));
}
export function archiveError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/unauthorized/i.test(message)) return NextResponse.json({ error: "Your session has expired. Sign in again." }, { status: 401 });
  if (/changed|conflict|stale/i.test(message)) return NextResponse.json({ error: "This profile changed. Reload the page before trying again." }, { status: 409 });
  return NextResponse.json({ error: "Could not archive this profile. Please try again." }, { status: 500 });
}
