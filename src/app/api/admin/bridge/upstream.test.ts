// @vitest-environment node
import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const { upstreamFetch } = vi.hoisted(() => ({ upstreamFetch: vi.fn() }));
vi.mock('@/lib/convex', async () => {
 const { ConvexHttpClient } = await import('convex/browser');
 return { getConvexClient: () => new ConvexHttpClient('https://synthetic-convex.invalid') };
});
import { POST } from './route';
beforeEach(() => {
 vi.stubEnv('ADMIN_PASSWORD', 'synthetic-password');
 vi.stubEnv('ADMIN_TOKEN_SALT', 'synthetic-salt');
 vi.stubEnv('ATTENDANCE_ADMIN_SECRET', 'synthetic-service-secret');
 upstreamFetch.mockReset();
 vi.stubGlobal('fetch', upstreamFetch);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
function request(kind: 'query' | 'mutation') {
 const token = crypto.createHash('sha256').update('synthetic-passwordsynthetic-salt').digest('hex');
 return new NextRequest('https://local.invalid/api/admin/bridge', { method: 'POST', headers: { cookie: 'admin_token=' + token, origin: 'https://local.invalid' }, body: JSON.stringify({ kind, name: kind === 'query' ? 'settings.get' : 'settings.set', args: kind === 'query' ? { key: 'synthetic' } : { key: 'synthetic', value: 'saved' } }) });
}
for (const kind of ['query', 'mutation'] as const) test(`real Convex HTTP ${kind} connection failure returns retryable status and recovers`, async () => {
 const success = (value: string) => new Response(JSON.stringify({ status: 'success', value, logLines: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
 upstreamFetch.mockResolvedValueOnce(success('loaded')).mockRejectedValueOnce(new TypeError('fetch failed', { cause: new Error('private synthetic connection reset') })).mockResolvedValueOnce(success('recovered'));
 expect(await (await POST(request(kind))).json()).toEqual({ result: 'loaded' });
 const failure = await POST(request(kind));
 expect(failure.status).toBe(503);
 expect(await failure.json()).toEqual({ error: 'Admin service temporarily unavailable. Please try again.' });
 expect(await (await POST(request(kind))).json()).toEqual({ result: 'recovered' });
 expect(upstreamFetch).toHaveBeenCalledTimes(3);
 for (const [url] of upstreamFetch.mock.calls) expect(new URL(String(url)).origin).toBe('https://synthetic-convex.invalid');
});
