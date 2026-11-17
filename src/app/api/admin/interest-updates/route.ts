import { ConvexClient } from "convex/browser";
import type { NextRequest } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import { adminRequestError, getAdminSecret, privateJson } from "@/lib/admin-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Rotate before the hosting timeout, rechecking the session on each connection.
export const maxDuration = 60;
type Page = { page: unknown[]; isDone: boolean; continueCursor: string };
type Watch = { cursor: string | null; stop: () => void; value?: string; next?: string | null };

/** The browser receives invalidations only. Credentials and query rows stay server-side.
 * Keep the terminal page subscribed, even when empty: it observes new insertions.
 * Cursor changes replace only the downstream chain, not the whole subscription. */
export async function POST(request: NextRequest) {
  const denied = adminRequestError(request);
  if (denied) return denied;
  const url = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return privateJson({ error: "Admin service not configured" }, 503);
  let client: ConvexClient;
  try { client = new ConvexClient(url, { unsavedChangesWarning: false, logger: false }); }
  catch { return privateJson({ error: "Interest updates unavailable" }, 503); }
  const secret = getAdminSecret();
  const chains: Watch[][] = [[], []];
  let closed = false;
  let pending: ReturnType<typeof setTimeout> | undefined;
  let lifetime: ReturnType<typeof setTimeout> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let finish = () => {};
  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearTimeout(pending); clearTimeout(lifetime); clearInterval(heartbeat);
    request.signal.removeEventListener("abort", finish);
    for (const chain of chains) for (const watch of chain) watch.stop();
    void client.close().catch(() => {});
  };
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (type: string) => {
        if (closed) return;
        // Never accumulate unbounded output for a stalled/disconnected consumer.
        if ((controller.desiredSize ?? 0) <= 0) { finish(); return; }
        controller.enqueue(new TextEncoder().encode(JSON.stringify({ type }) + "\n"));
      };
      finish = () => { if (!closed) { cleanup(); controller.close(); } };
      const fail = () => { send("error"); finish(); };
      const invalidate = () => {
        if (!pending && !closed) pending = setTimeout(() => { pending = undefined; send("invalidate"); }, 100);
      };
      const subscribe = (chain: Watch[], query: typeof api.interests.workbenchPage | typeof api.interests.disclosureEvidencePage, numItems: number, cursor: string | null) => {
        if (closed) return;
        if (chain.some(w => w.cursor === cursor)) { fail(); return; }
        const watch: Watch = { cursor, stop: () => {} };
        chain.push(watch);
        watch.stop = client.onUpdate(query, { adminSecret: secret, paginationOpts: { numItems, cursor } }, (result: Page) => {
          if (closed || !chain.includes(watch)) return;
          const value = JSON.stringify(result);
          // Initial results establish the complete watch and close the snapshot/subscription race.
          // Snapshot refreshes never recreate these subscriptions, so this cannot loop.
          if (value !== watch.value) { watch.value = value; invalidate(); }
          const next = result.isDone ? null : result.continueCursor;
          if (!result.isDone && !next) { fail(); return; }
          if (watch.next !== next) {
            watch.next = next;
            for (const removed of chain.splice(chain.indexOf(watch) + 1)) removed.stop();
            if (next !== null) subscribe(chain, query, numItems, next);
          }
        }, fail);
      };
      request.signal.addEventListener("abort", finish, { once: true });
      if (request.signal.aborted) { finish(); return; }
      lifetime = setTimeout(finish, 55000);
      heartbeat = setInterval(() => send("heartbeat"), 15000);
      try {
        subscribe(chains[0], api.interests.workbenchPage, 100, null);
        subscribe(chains[1], api.interests.disclosureEvidencePage, 500, null);
      } catch { fail(); }
    },
    cancel() { cleanup(); },
  });
  return new Response(stream, { headers: {
    "Content-Type": "application/x-ndjson", "Cache-Control": "private, no-store, no-transform",
    "Vary": "Cookie, Origin", "X-Accel-Buffering": "no",
  } });
}
