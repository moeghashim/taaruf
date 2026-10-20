"use client";

import { ConvexProvider as ConvexReactProvider, ConvexReactClient } from "convex/react";
import { ReactNode, useMemo } from "react";

export function ConvexProvider({ children, reviewOnly = false }: { children: ReactNode; reviewOnly?: boolean }) {
  const convex = useMemo(() => {
    // Never connect a review-only deployment directly to live Convex queries/mutations.
    const url = reviewOnly ? "https://preview-backend-disabled.invalid" : process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url) return null;
    return new ConvexReactClient(url);
  }, [reviewOnly]);

  if (!convex) {
    return <>{children}</>;
  }

  return <ConvexReactProvider client={convex}>{children}</ConvexReactProvider>;
}
