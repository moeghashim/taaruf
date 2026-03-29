import { NextResponse } from "next/server";

export async function GET() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const vercelUrl = process.env.VERCEL_URL;
  return NextResponse.json({
    NEXT_PUBLIC_APP_URL: appUrl ? `${appUrl} (len: ${appUrl.length})` : "NOT SET",
    VERCEL_URL: vercelUrl ? `${vercelUrl} (len: ${vercelUrl.length})` : "NOT SET",
  });
}
