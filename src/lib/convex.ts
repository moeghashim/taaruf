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

/** Request-scoped client: consistentQuery pins all pages to one snapshot, never
 * reuse this client across requests. Abort propagates to every backend fetch. */
export function getSnapshotConvexClient(signal: AbortSignal): ConvexHttpClient {
  const url = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("Convex URL not configured");
  return new ConvexHttpClient(url, { fetch: (input, init) => fetch(input, { ...init, signal }) });
}
