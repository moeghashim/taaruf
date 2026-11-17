const unavailable = "Interest data unavailable. Retry to refresh.";
class SessionError extends Error {}
function check(response: Response) {
  if (response.status === 401 || response.status === 403) throw new SessionError("Your admin session has expired. Sign in again.");
  if (!response.ok) throw new Error(unavailable);
}
/** One persistent stream plus serialized, coalesced complete snapshots. No polling. */
export function watchInterestUpdates<T>(onRows: (rows: T[]) => void, onError: (message: string) => void) {
  const controller = new AbortController();
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let snapshotRetry: ReturnType<typeof setTimeout> | undefined;
  let dirty = false, fetching = false, stopped = false;
  let streamBackoff = 1000, snapshotBackoff = 1000;
  const options = { method: "POST", credentials: "same-origin" as const, cache: "no-store" as const, signal: controller.signal };
  const stop = () => {
    stopped = true; controller.abort(); clearTimeout(refreshTimer); clearTimeout(reconnectTimer); clearTimeout(snapshotRetry);
  };
  const report = (error: unknown) => {
    if (stopped) return;
    onError(error instanceof SessionError ? error.message : unavailable);
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
      if (!stopped) onRows(result);
      snapshotBackoff = 1000;
    } catch (error) {
      report(error);
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
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const started = Date.now();
    try {
      const response = await fetch("/api/admin/interest-updates", options);
      check(response);
      if (!response.body) throw new Error(unavailable);
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (buffer.length > 8192) throw new Error(unavailable);
        let newline: number;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
          const message = JSON.parse(line);
          if (message.type === "invalidate") refresh();
          else if (message.type !== "heartbeat") throw new Error(unavailable);
        }
      }
      if (Date.now() - started < 45000) throw new Error(unavailable);
    } catch (error) { report(error); }
    finally {
      await reader?.cancel().catch(() => {});
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
