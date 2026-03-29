import { NextResponse } from "next/server";

export async function GET() {
  const convexUrl = process.env.CONVEX_URL;
  const nextPublicConvexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  return NextResponse.json({
    CONVEX_URL: convexUrl ? `${convexUrl.substring(0, 20)}... (len: ${convexUrl.length})` : "NOT SET",
    NEXT_PUBLIC_CONVEX_URL: nextPublicConvexUrl ? `${nextPublicConvexUrl.substring(0, 20)}... (len: ${nextPublicConvexUrl.length})` : "NOT SET",
  });
}
