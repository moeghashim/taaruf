import { isManualMatchDraft } from "../src/lib/manual-match-draft";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

/** Only verified terminal history is harmless. Missing/foreign pointers fail
 * closed; paused pointers retain existing semantics until explicitly cleared. */
export async function hasBlockingMatchPointer(ctx: QueryCtx | MutationCtx, person: Doc<"registrations">, except?: Id<"matches">) {
  if (!person.activeMatchId) return false;
  const match = await ctx.db.get(person.activeMatchId);
  if (!match || ![match.maleRegistrationId, match.femaleRegistrationId].includes(person._id)) return true;
  if (match._id === except) return false;
  return match.status !== "closed" && match.status !== "declined";
}

/** Availability includes actual rows in BOTH participant indexes, irrespective of
 * pointer freshness or recorded gender. Preserve private-draft, paused and reset
 * history exceptions; overflow is unavailable rather than a partial-history guess. */
export async function hasBlockingMatch(ctx: QueryCtx | MutationCtx, person: Doc<"registrations">, except?: Id<"matches">) {
  if (await hasBlockingMatchPointer(ctx, person, except)) return true;
  const ranges = await Promise.all([
    ctx.db.query("matches").withIndex("by_maleRegistrationId", q => q.eq("maleRegistrationId", person._id)).take(1001),
    ctx.db.query("matches").withIndex("by_femaleRegistrationId", q => q.eq("femaleRegistrationId", person._id)).take(1001),
  ]);
  if (ranges.some(rows => rows.length > 1000)) return true;
  return ranges.flat().some(m => m._id !== except && m.testResetAt === undefined && !isManualMatchDraft(m) && !["closed", "declined", "paused"].includes(m.status));
}

/** Fresh compare-and-clear in the transaction: OCC retries cannot erase a newer pointer. */
export async function clearMatchParticipantPointers(ctx: MutationCtx, match: Doc<"matches">) {
  for (const id of [match.maleRegistrationId, match.femaleRegistrationId]) {
    const person = await ctx.db.get(id);
    if (person?.activeMatchId === match._id) await ctx.db.patch(id, { activeMatchId: undefined });
  }
}
