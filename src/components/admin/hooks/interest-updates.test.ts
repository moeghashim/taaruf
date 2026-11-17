// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { watchInterestUpdates } from "./interest-updates";
let stream: ReadableStreamDefaultController<Uint8Array>;
let stop: (() => void) | undefined;
let signals: AbortSignal[];
const rows = vi.fn(), errors = vi.fn();
const request = vi.fn();
function emit(type = "invalidate") { stream.enqueue(new TextEncoder().encode(JSON.stringify({ type }) + String.fromCharCode(10))); }
beforeEach(() => {
 vi.useFakeTimers(); vi.clearAllMocks(); signals = [];
 request.mockImplementation(async (url: string, options: RequestInit) => {
  signals.push(options.signal as AbortSignal);
  if (url.endsWith("bridge")) return Response.json({ result: [{ id: "one" }] });
  return new Response(new ReadableStream({ start(controller) { stream = controller; options.signal?.addEventListener("abort", () => { try { controller.close(); } catch { /* already cancelled */ } }, { once: true }); } }));
 });
 vi.stubGlobal("fetch", request);
});
afterEach(async () => { stop?.(); await vi.advanceTimersByTimeAsync(0); vi.useRealTimers(); vi.unstubAllGlobals(); });
const snapshots = () => request.mock.calls.filter(([url]) => url.endsWith("bridge"));
const streams = () => request.mock.calls.filter(([url]) => url.endsWith("interest-updates"));
function start() { const watcher = watchInterestUpdates(rows, errors); stop = watcher.stop; return watcher; }
test("initial snapshot plus coalesced invalidations; no periodic snapshot polling or stream recreation", async () => {
 start(); await vi.advanceTimersByTimeAsync(100);
 expect(rows).toHaveBeenCalledWith([{ id: "one" }]); expect(snapshots()).toHaveLength(1);
 emit(); emit(); emit(); await vi.advanceTimersByTimeAsync(100);
 expect(snapshots()).toHaveLength(2); expect(streams()).toHaveLength(1);
 for (let i = 0; i < 4; i++) { emit("heartbeat"); await vi.advanceTimersByTimeAsync(15000); }
 expect(snapshots()).toHaveLength(2); expect(streams()).toHaveLength(1);
 expect(request.mock.calls[0][1]).toMatchObject({ method: "POST", credentials: "same-origin", cache: "no-store" });
 expect(JSON.stringify(request.mock.calls)).not.toContain("adminSecret");
});
test("serializes slow snapshots and retains invalidations arriving during them", async () => {
 let resolve!: (response: Response) => void;
 const normal = request.getMockImplementation()!;
 request.mockImplementation((url, options) => url.endsWith("bridge") ? new Promise<Response>(r => { resolve = r; }) : normal(url, options));
 start(); await vi.advanceTimersByTimeAsync(100);
 emit(); emit(); await vi.advanceTimersByTimeAsync(500);
 expect(snapshots()).toHaveLength(1);
 resolve(Response.json({ result: [{ id: "old" }] })); await vi.advanceTimersByTimeAsync(100);
 expect(snapshots()).toHaveLength(2); expect(rows).toHaveBeenCalledTimes(1);
 resolve(Response.json({ result: [{ id: "new" }] })); await vi.advanceTimersByTimeAsync(0);
 expect(rows).toHaveBeenLastCalledWith([{ id: "new" }]);
});
test("abort cleans timers, stops reconnect and ignores in-flight snapshot results", async () => {
 const watcher = start(); await vi.advanceTimersByTimeAsync(100);
 watcher.stop(); expect(signals.every(signal => signal.aborted)).toBe(true);
 await vi.advanceTimersByTimeAsync(120000); expect(request).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(0);
});
test("authentication failure is terminal; no secret/error detail reaches UI", async () => {
 request.mockResolvedValue(new Response("secret detail", { status: 401 }));
 start(); await vi.advanceTimersByTimeAsync(120000);
 expect(request).toHaveBeenCalledOnce(); expect(errors).toHaveBeenCalledWith("Your admin session has expired. Sign in again."); expect(rows).not.toHaveBeenCalled();
});
test("stream errors reconnect with bounded exponential delay, without refetch loops", async () => {
 start(); await vi.advanceTimersByTimeAsync(100);
 emit("error"); await vi.advanceTimersByTimeAsync(0);
 await vi.advanceTimersByTimeAsync(999); expect(streams()).toHaveLength(1);
 await vi.advanceTimersByTimeAsync(1); expect(streams()).toHaveLength(2);
 emit("error"); await vi.advanceTimersByTimeAsync(1999); expect(streams()).toHaveLength(2);
 await vi.advanceTimersByTimeAsync(1); expect(streams()).toHaveLength(3); expect(snapshots()).toHaveLength(1);
});
test("snapshot failure keeps last rows and retries with backoff", async () => {
 const watcher = start(); await vi.advanceTimersByTimeAsync(100);
 request.mockResolvedValueOnce(new Response("private detail", { status: 503 }));
 watcher.refresh(); await vi.advanceTimersByTimeAsync(100);
 expect(rows).toHaveBeenCalledTimes(1); expect(errors).toHaveBeenCalledWith("Interest data unavailable. Retry to refresh.");
 await vi.advanceTimersByTimeAsync(1100); expect(rows).toHaveBeenCalledTimes(2); expect(streams()).toHaveLength(1);
});

test.each(["heartbeat", "invalidate"])("snapshot success preserves outage until a %s proves stream recovery", async type => {
 const watcher = start(); await vi.advanceTimersByTimeAsync(100);
 emit("error"); await vi.advanceTimersByTimeAsync(0);
 const warning = "Interest data unavailable. Retry to refresh.";
 watcher.refresh(); await vi.advanceTimersByTimeAsync(100);
 expect(rows).toHaveBeenCalledTimes(2);
 expect(errors).toHaveBeenLastCalledWith(warning);
 await vi.advanceTimersByTimeAsync(900); // response headers alone are not recovery
 expect(streams()).toHaveLength(2); expect(errors).toHaveBeenLastCalledWith(warning);
 emit(type); await vi.advanceTimersByTimeAsync(0);
 expect(errors).toHaveBeenLastCalledWith(undefined);
});
test("stream recovery does not erase a snapshot error; snapshot recovery does", async () => {
 const watcher = start(); await vi.advanceTimersByTimeAsync(100);
 request.mockResolvedValueOnce(new Response("private", { status: 503 }));
 watcher.refresh(); await vi.advanceTimersByTimeAsync(100);
 emit("error"); await vi.advanceTimersByTimeAsync(1000);
 emit("heartbeat"); await vi.advanceTimersByTimeAsync(0);
 expect(errors).toHaveBeenLastCalledWith("Interest data unavailable. Retry to refresh.");
 await vi.advanceTimersByTimeAsync(100);
 expect(errors).toHaveBeenLastCalledWith(undefined);
});
test.each(["fetch", "read"])("watchdog aborts stalled %s and reconnects even when transport ignores abort", async stage => {
 const normal = request.getMockImplementation()!;
 const cancel = vi.fn(() => new Promise<void>(() => {}));
 request.mockImplementation((url, options) => {
  if (url.endsWith("bridge")) return normal(url, options);
  signals.push(options.signal);
  return stage === "fetch" ? new Promise<Response>(() => {}) : Promise.resolve(new Response(new ReadableStream({ cancel })));
 });
 const watcher = start(); await vi.advanceTimersByTimeAsync(24999);
 expect(streams()).toHaveLength(1); expect(signals[0].aborted).toBe(false);
 await vi.advanceTimersByTimeAsync(1);
 expect(signals[0].aborted).toBe(true);
 expect(errors).toHaveBeenLastCalledWith("Interest data unavailable. Retry to refresh.");
 await vi.advanceTimersByTimeAsync(1000);
 expect(streams()).toHaveLength(2);
 expect(streams()[1][1].signal).not.toBe(streams()[0][1].signal);
 expect(snapshots()).toHaveLength(1);
 if (stage === "read") expect(cancel).toHaveBeenCalledOnce();
 watcher.stop(); const count = errors.mock.calls.length;
 await vi.advanceTimersByTimeAsync(120000);
 expect(streams()).toHaveLength(2); expect(vi.getTimerCount()).toBe(0);
 expect(errors).toHaveBeenCalledTimes(count);
 expect(signals.every(signal => signal.aborted)).toBe(true);
});
test("valid heartbeats reset silence deadline, partial bytes do not", async () => {
 start(); await vi.advanceTimersByTimeAsync(20000);
 emit("heartbeat"); await vi.advanceTimersByTimeAsync(20000);
 expect(signals[0].aborted).toBe(false);
 stream.enqueue(new TextEncoder().encode('{"type":'));
 await vi.advanceTimersByTimeAsync(5000);
 expect(signals[0].aborted).toBe(true);
 expect(errors).toHaveBeenLastCalledWith("Interest data unavailable. Retry to refresh.");
});
test("terminal snapshot authentication error overrides outage and cannot be cleared by late results", async () => {
 const watcher = start(); await vi.advanceTimersByTimeAsync(100);
 emit("error"); await vi.advanceTimersByTimeAsync(0);
 request.mockResolvedValueOnce(new Response("private", { status: 403 }));
 watcher.refresh(); await vi.advanceTimersByTimeAsync(100);
 expect(errors).toHaveBeenLastCalledWith("Your admin session has expired. Sign in again.");
 await vi.advanceTimersByTimeAsync(120000);
 expect(streams()).toHaveLength(1); expect(vi.getTimerCount()).toBe(0);
});
