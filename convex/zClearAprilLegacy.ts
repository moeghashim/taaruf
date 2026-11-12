import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

// One-time operation, bound to the complete authorized snapshot (no identity data here).
const AUTHORIZED_DIGEST = "de9ac2ac10332081feb7c838086b7f3bf15a06d4468625d5628d58d6e0ac4d45";
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return "{" + Object.keys(obj).sort().map(k => JSON.stringify(k) + ":" + canonical(obj[k])).join(",") + "}";
  }
  return JSON.stringify(value);
}
export async function digest(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(value)));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
}
export async function clearExact(ctx: MutationCtx, expected: Doc<"eventWaitlistEntries">[], authorizedDigest: string) {
  if (expected.length !== 23 || new Set(expected.map(r => r._id)).size !== 23 || await digest(expected) !== authorizedDigest) throw new Error("Unauthorized snapshot");
  const eventId = expected[0].eventId;
  const event = await ctx.db.get(eventId);
  if (!event || event.eventCode !== "apr26" || expected.some(r => r.eventId !== eventId || r.status !== "active")) throw new Error("Wrong event or scope");
  const current = await ctx.db.query("eventWaitlistEntries").withIndex("by_eventId", q => q.eq("eventId", eventId)).collect();
  if (current.length !== 23) throw new Error("Waitlist scope changed");
  const byId = new Map(current.map(r => [r._id, r]));
  let alreadyRemoved = 0;
  for (const original of expected) {
    const row = byId.get(original._id);
    if (!row) throw new Error("Waitlist identity changed");
    if (canonical(row) === canonical(original)) continue;
    const restored = { ...row, status: original.status, updatedAt: original.updatedAt };
    if (original.removedAt === undefined) delete restored.removedAt;
    else restored.removedAt = original.removedAt;
    if (row.status !== "removed" || row.removedAt === undefined || row.updatedAt !== row.removedAt || canonical(restored) !== canonical(original)) throw new Error("Waitlist values changed");
    alreadyRemoved++;
  }
  if (alreadyRemoved === 23) return { cleared: 0, alreadyRemoved: 23, active: 0 };
  if (alreadyRemoved !== 0) throw new Error("Partial prior changes");
  const now = Date.now();
  for (const row of expected) await ctx.db.patch(row._id, { status: "removed", removedAt: now, updatedAt: now });
  return { cleared: 23, alreadyRemoved: 0, active: 0 };
}
export const clear = internalMutation({
  args: { expected: v.array(v.any()) },
  returns: v.object({ cleared: v.number(), alreadyRemoved: v.number(), active: v.number() }),
  handler: (ctx, args) => clearExact(ctx, args.expected, AUTHORIZED_DIGEST),
});
