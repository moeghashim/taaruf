const unavailable = "Interest data unavailable. Retry to refresh.";
class SessionError extends Error {}
function check(response: Response) {
  if (response.status === 401 || response.status === 403) throw new SessionError("Your admin session has expired. Sign in again.");
  if (!response.ok) throw new Error(unavailable);
}
/** One persistent stream plus serialized, coalesced complete snapshots. No polling. */
export function watchInterestUpdates<T>(onRows: (rows: T[]) => void, onError: (message: string | undefined) => void) {
  const controller = new AbortController();
  let streamController: AbortController | undefined;
  let silenceTimer: ReturnType<typeof setTimeout> | undefined;
  let transportError: string | undefined, snapshotError: string | undefined;
  const publishError = () => { if (!stopped) onError(transportError ?? snapshotError); };
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let snapshotRetry: ReturnType<typeof setTimeout> | undefined;
  let dirty = false, fetching = false, stopped = false;
  let streamBackoff = 1000, snapshotBackoff = 1000;
  const options = { method: "POST", credentials: "same-origin" as const, cache: "no-store" as const, signal: controller.signal };
  const stop = () => {
    stopped = true; controller.abort(); streamController?.abort(); clearTimeout(silenceTimer); clearTimeout(refreshTimer); clearTimeout(reconnectTimer); clearTimeout(snapshotRetry);
  };
  const report = (error: unknown, source: "transport" | "snapshot") => {
    if (stopped) return;
    const message = error instanceof SessionError ? error.message : unavailable;
    if (source === "transport") transportError = message; else snapshotError = message;
    // Authentication errors take precedence over a previous transport warning.
    if (error instanceof SessionError) onError(message); else publishError();
    if (error instanceof SessionError) stop();
  };
  const refresh = () => {
    if (stopped) return;
    dirty = true;
    if (!fetching && !refreshTimer && !snapshotRetry) refreshTimer = setTimeout(() => { refreshTimer = undefined; void snapshot(); }, 100);
  };
  const snapshot = async () => {
    if (stopped || fetching) return;
    fetching = true; dirty = false;
    try {
      const response = await fetch("/api/admin/bridge", { ...options, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "query", name: "interests.getAll", args: {} }) });
      check(response);
      const { result } = await response.json();
      if (!Array.isArray(result)) throw new Error(unavailable);
      if (!stopped) { onRows(result); snapshotError = undefined; publishError(); }
      snapshotBackoff = 1000;
    } catch (error) {
      report(error, "snapshot");
      if (!stopped) {
        snapshotRetry = setTimeout(() => { snapshotRetry = undefined; refresh(); }, snapshotBackoff);
        snapshotBackoff = Math.min(30000, snapshotBackoff * 2);
      }
    } finally {
      fetching = false;
      if (dirty) refresh();
    }
  };
  const connect = async () => {
    if (stopped) return;
    const connection = new AbortController();
    streamController = connection;
    // Race the I/O as well as aborting it: a stalled reader/cancel must not
    // prevent reconnecting, even if the underlying transport ignores abort.
    let rejectSilence!: (error: Error) => void;
    const interrupted = new Promise<never>((_, reject) => { rejectSilence = reject; });
    const abort = () => rejectSilence(new Error(unavailable));
    connection.signal.addEventListener("abort", abort, { once: true });
    const armWatchdog = () => {
      clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => connection.abort(), 25000);
    };
    armWatchdog();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const started = Date.now();
    try {
      const response = await Promise.race([fetch("/api/admin/interest-updates", { ...options, signal: connection.signal }), interrupted]);
      check(response);
      if (!response.body) throw new Error(unavailable);
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await Promise.race([reader.read(), interrupted]);
        if (done) break;
        if (stopped) return;
        buffer += decoder.decode(value, { stream: true });
        if (buffer.length > 8192) throw new Error(unavailable);
        let newline: number;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
          const message = JSON.parse(line);
          if (message.type !== "invalidate" && message.type !== "heartbeat") throw new Error(unavailable);
          armWatchdog();
          transportError = undefined; publishError();
          if (message.type === "invalidate") refresh();
        }
      }
      if (Date.now() - started < 45000) throw new Error(unavailable);
    } catch (error) { report(error, "transport"); }
    finally {
      clearTimeout(silenceTimer);
      connection.signal.removeEventListener("abort", abort);
      connection.abort();
      if (streamController === connection) streamController = undefined;
      // Cancellation is best effort; never await an unresponsive source.
      void reader?.cancel().catch(() => {});
      reader?.releaseLock();
      if (!stopped) {
        if (Date.now() - started >= 45000) streamBackoff = 1000;
        reconnectTimer = setTimeout(() => { reconnectTimer = undefined; void connect(); }, streamBackoff);
        streamBackoff = Math.min(30000, streamBackoff * 2);
      }
    }
  };
  refresh(); void connect();
  return { refresh, stop };
}
