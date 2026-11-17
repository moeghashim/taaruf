// @vitest-environment node
import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ subscriptions: [] as { args: { paginationOpts: { cursor: string | null; numItems: number }; adminSecret: string }; update: (page: unknown) => void; error: (error: Error) => void; stop: ReturnType<typeof vi.fn> }[], close: vi.fn(), construct: vi.fn() }));
vi.mock('convex/browser', () => ({ ConvexClient: class {
 constructor() { mocks.construct(); }
 onUpdate(_query: unknown, args: typeof mocks.subscriptions[number]['args'], update: (page: unknown) => void, error: (error: Error) => void) {
  const stop = vi.fn(); mocks.subscriptions.push({ args, update, error, stop }); return stop;
 }
 close = mocks.close;
} }));
import { POST } from './route';
const token = crypto.createHash('sha256').update('passwordsalt').digest('hex');
function request(cookie = token, origin = 'https://local.invalid', signal?: AbortSignal) {
 return new NextRequest('https://local.invalid/api/admin/interest-updates', { method: 'POST', headers: { cookie: 'admin_token=' + cookie, origin }, signal });
}
const page = (isDone = true, continueCursor = '', rows: unknown[] = []) => ({ page: rows, isDone, continueCursor });
beforeEach(() => {
 vi.useFakeTimers(); mocks.subscriptions.length = 0; vi.clearAllMocks(); mocks.close.mockResolvedValue(undefined);
 vi.stubEnv('ADMIN_PASSWORD', 'password'); vi.stubEnv('ADMIN_TOKEN_SALT', 'salt'); vi.stubEnv('ATTENDANCE_ADMIN_SECRET', 'server-only'); vi.stubEnv('CONVEX_URL', 'https://synthetic.convex.cloud');
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
test.each([['forged', 'https://local.invalid', 401], [token, 'https://evil.invalid', 403], [token, '', 403]])('rejects unauthenticated or cross-origin stream %#', async (cookie, origin, status) => {
 expect((await POST(request(cookie as string, origin as string))).status).toBe(status); expect(mocks.construct).not.toHaveBeenCalled();
});
test('subscribes both complete chains, retains empty tails, coalesces and redacts invalidations', async () => {
 const response = await POST(request()); const reader = response.body!.getReader();
 expect(response.headers.get('cache-control')).toContain('no-store');
 expect(mocks.subscriptions).toHaveLength(2);
 mocks.subscriptions[0].update(page(false, 'interest-tail', [{ private: 'not-for-stream' }]));
 mocks.subscriptions[1].update(page(false, 'evidence-tail'));
 expect(mocks.subscriptions).toHaveLength(4);
 expect(mocks.subscriptions[2].args).toEqual({ adminSecret: 'server-only', paginationOpts: { numItems: 100, cursor: 'interest-tail' } });
 expect(mocks.subscriptions[3].args.paginationOpts.numItems).toBe(500);
 mocks.subscriptions[2].update(page()); mocks.subscriptions[3].update(page());
 await vi.advanceTimersByTimeAsync(100);
 expect(JSON.parse(new TextDecoder().decode((await reader.read()).value))).toEqual({ type: 'invalidate' });
 expect(mocks.subscriptions[2].stop).not.toHaveBeenCalled();
 mocks.subscriptions[2].update(page(true, '', [{ new: true }]));
 await vi.advanceTimersByTimeAsync(100);
 expect(new TextDecoder().decode((await reader.read()).value)).toContain('invalidate');
 await reader.cancel(); expect(mocks.close).toHaveBeenCalledOnce();
 for (const sub of mocks.subscriptions) expect(sub.stop).toHaveBeenCalledOnce();
 expect(vi.getTimerCount()).toBe(0);
});
test('cursor changes remove obsolete downstream watches; repeated values do not invalidate', async () => {
 const response = await POST(request()); const reader = response.body!.getReader();
 mocks.subscriptions[0].update(page(false, 'old')); mocks.subscriptions[2].update(page());
 await vi.advanceTimersByTimeAsync(100); await reader.read();
 mocks.subscriptions[0].update(page(false, 'old')); expect(vi.getTimerCount()).toBe(2);
 mocks.subscriptions[0].update(page(false, 'new'));
 expect(mocks.subscriptions[2].stop).toHaveBeenCalledOnce(); expect(mocks.subscriptions[3].args.paginationOpts.cursor).toBe('new');
 await reader.cancel();
});
test('abort and bounded lifetime clean up every websocket subscription', async () => {
 const abort = new AbortController(); const response = await POST(request(token, 'https://local.invalid', abort.signal));
 abort.abort(); expect(mocks.close).toHaveBeenCalledOnce(); expect((await response.body!.getReader().read()).done).toBe(true);
 const other = await POST(request()); await vi.advanceTimersByTimeAsync(55000);
 expect(mocks.close).toHaveBeenCalledTimes(2); await other.body!.cancel(); expect(vi.getTimerCount()).toBe(0);
});
test('subscription errors expose only generic errors and release resources', async () => {
 const response = await POST(request()); const reader = response.body!.getReader();
 mocks.subscriptions[0].error(new Error('server-only credential'));
 expect(JSON.parse(new TextDecoder().decode((await reader.read()).value))).toEqual({ type: 'error' });
 expect((await reader.read()).done).toBe(true); expect(mocks.close).toHaveBeenCalledOnce();
});
