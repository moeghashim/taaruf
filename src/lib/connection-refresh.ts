/** Only a committed terminal action may retire its own selected detail. */
export function terminalConnectionAction(body: Record<string, unknown>): string | null {
  const terminal = (body.action === "respond" && body.decision === "decline")
    || (body.action === "final_approval" && body.approved === false)
    || body.action === "withdraw" || body.action === "close_connection";
  return terminal && typeof body.interestId === "string" ? body.interestId : null;
}

/** Compare-and-clear: never replace a newer selection or unrelated URL state. */
export function withoutSelectedConnection(href: string, expected: string): string | null {
  const url = new URL(href);
  if (url.searchParams.get("connection") !== expected) return null;
  url.searchParams.delete("connection");
  return url.pathname + url.search + url.hash;
}

export function unavailableConnection(status: number, error: unknown): boolean {
  return status === 404 && error === "Connection unavailable.";
}
