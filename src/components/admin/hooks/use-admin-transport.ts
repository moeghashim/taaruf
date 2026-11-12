'use client';
import { useCallback, useEffect, useState } from 'react';
import type { FunctionArgs, FunctionReturnType } from 'convex/server';
import type { adminQueries, adminMutations } from '@/lib/admin-operations';
type Queries = typeof adminQueries;
type Mutations = typeof adminMutations;
type Args<F extends Queries[keyof Queries] | Mutations[keyof Mutations]> = Omit<FunctionArgs<F>, 'adminSecret'>;
const refreshEvent = 'admin-data-refresh';
export function refreshAdminData() { window.dispatchEvent(new Event(refreshEvent)); }
class AdminRequestError extends Error {
 constructor(message: string, readonly retryable = false) { super(message); }
}
async function call(kind: 'query' | 'mutation', name: string, args: unknown, signal?: AbortSignal) {
 try {
  const response = await fetch('/api/admin/bridge', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, name, args }), signal });
  if (!response.ok) {
   const message = response.status === 401 ? 'Your admin session has expired. Sign in again.' : response.status === 403 ? 'Admin access denied.' : 'Admin request failed. Refresh and try again.';
   throw new AdminRequestError(message, response.status === 408 || response.status === 429 || response.status >= 500);
  }
  const body = await response.json();
  return body.result;
 } catch (error) {
  if (error instanceof AdminRequestError) throw error;
  throw new AdminRequestError('Unable to reach admin service. Please try again.', true);
 }
}
export function useAdminQuery<K extends keyof Queries>(name: K, args?: Args<Queries[K]> | 'skip'): FunctionReturnType<Queries[K]> | undefined {
 const serialized = JSON.stringify(args ?? {});
 const key = name + serialized;
 const [state, setState] = useState<{ key: string; value?: FunctionReturnType<Queries[K]>; error?: Error }>();
 useEffect(() => {
  if (serialized === '"skip"') return;
  let stopped = false;
  let running = false;
  const controller = new AbortController();
  async function refresh() {
   if (running) return;
   running = true;
   try {
    const value = await call('query', name, JSON.parse(serialized), controller.signal);
    if (!stopped) setState({ key, value });
   } catch (error) {
    if (!stopped && !(error instanceof AdminRequestError && error.retryable)) setState({ key, error: new Error(error instanceof AdminRequestError ? error.message : 'Admin request failed') });
   } finally { running = false; }
  }
  void refresh();
  const interval = window.setInterval(refresh, 2000);
  window.addEventListener(refreshEvent, refresh);
  window.addEventListener('focus', refresh);
  return () => { stopped = true; controller.abort(); window.clearInterval(interval); window.removeEventListener(refreshEvent, refresh); window.removeEventListener('focus', refresh); };
 }, [key, name, serialized]);
 if (state?.key === key && state.error) throw state.error;
 return state?.key === key ? state.value : undefined;
}
export function useAdminMutation<K extends keyof Mutations>(name: K) {
 return useCallback(async (args: Args<Mutations[K]>): Promise<FunctionReturnType<Mutations[K]>> => {
  const result = await call('mutation', name, args);
  refreshAdminData();
  return result;
 }, [name]);
}
