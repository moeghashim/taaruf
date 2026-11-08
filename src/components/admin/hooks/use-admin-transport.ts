'use client';
import { useCallback, useEffect, useState } from 'react';
import type { FunctionArgs, FunctionReturnType } from 'convex/server';
import type { adminQueries, adminMutations } from '@/lib/admin-operations';
type Queries = typeof adminQueries;
type Mutations = typeof adminMutations;
type Args<F extends Queries[keyof Queries] | Mutations[keyof Mutations]> = Omit<FunctionArgs<F>, 'adminSecret'>;
const refreshEvent = 'admin-data-refresh';
export function refreshAdminData() { window.dispatchEvent(new Event(refreshEvent)); }
async function call(kind: 'query' | 'mutation', name: string, args: unknown, signal?: AbortSignal) {
 const response = await fetch('/api/admin/bridge', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, name, args }), signal });
 const body = await response.json();
 if (!response.ok) throw new Error(body.error || 'Admin request failed');
 return body.result;
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
    if (!stopped) setState({ key, error: error instanceof Error ? error : new Error('Admin request failed') });
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
