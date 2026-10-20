import { NextRequest, NextResponse } from "next/server";

/** Preview credentials currently point at live data. Fail closed until an
 * explicitly isolated backend is configured; even GET login links can mutate. */
export function middleware(request: NextRequest) {
  // Admin sign-in only creates a local cookie and allows viewing the empty UI shell.
  if (request.nextUrl.pathname === "/api/admin/auth") return NextResponse.next();
  if (process.env.VERCEL_ENV === "preview" && process.env.PREVIEW_BACKEND_ISOLATED !== "true") {
    return NextResponse.json(
      { error: "UI-review-only preview: API access is disabled until an isolated preview backend is configured. Do not submit real applicant data." },
      { status: 503 },
    );
  }
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
