import { ConvexHttpClient } from "convex/browser";

let _convexClient: ConvexHttpClient | null = null;

export function getConvexClient(): ConvexHttpClient {
  if (!_convexClient) {
    _convexClient = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  }
  return _convexClient;
}
