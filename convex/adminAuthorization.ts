/** Server bridge credential only. Never ship this value to a browser. */
export function requireAdmin(secret: string | undefined): void {
  const expected = process.env.ATTENDANCE_ADMIN_SECRET;
  if (!expected || !secret || secret !== expected) throw new Error("Unauthorized");
}

/** Remove reusable capabilities from records serialized for administration. */
export function withoutCapabilities<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withoutCapabilities) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([key]) =>
      !["profileAccessToken", "shareToken", "sessionHash", "tokenHash", "stripeSessionId"].includes(key)
    ).map(([key, item]) => [key, withoutCapabilities(item)])) as T;
  }
  return value;
}
