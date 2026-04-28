import { ConvexHttpClient } from "convex/browser";

let _convexClient: ConvexHttpClient | null = null;

export function getConvexClient(): ConvexHttpClient {
  if (!_convexClient) {
    const convexUrl = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      throw new Error("Convex URL not configured");
    }
    _convexClient = new ConvexHttpClient(convexUrl);
  }
  return _convexClient;
}
