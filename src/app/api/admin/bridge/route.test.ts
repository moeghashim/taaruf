// @vitest-environment node
import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { api } from '../../../../../convex/_generated/api';
const { query, mutation } = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn() }));
vi.mock('@/lib/convex', () => ({ getConvexClient: () => ({ query, mutation }), getSnapshotConvexClient: () => ({ consistentQuery: query }) }));
import { POST } from './route';
const token = crypto.createHash('sha256').update('synthetic-passwordsynthetic-salt').digest('hex');
const valid = { kind: 'query', name: 'registrations.getAll', args: {} };
function request(body: unknown = valid, cookie = token, origin: string | null = 'https://local.invalid') {
 return new NextRequest('https://local.invalid/api/admin/bridge', { method: 'POST', headers: { cookie: 'admin_token=' + cookie, ...(origin ? { origin } : {}) }, body: JSON.stringify(body) });
}
beforeEach(() => {
 vi.stubEnv('ADMIN_PASSWORD', 'synthetic-password'); vi.stubEnv('ADMIN_TOKEN_SALT', 'synthetic-salt'); vi.stubEnv('ATTENDANCE_ADMIN_SECRET', 'synthetic-service-secret');
 query.mockReset().mockResolvedValue([]); mutation.mockReset().mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());
test.each(['', 'forged', '0'.repeat(64), 'é'.repeat(64)])('rejects invalid session %s', async cookie => {
 expect((await POST(request(valid, cookie))).status).toBe(401); expect(query).not.toHaveBeenCalled(); expect(mutation).not.toHaveBeenCalled();
});
test.each([null, 'null', 'https://evil.invalid', 'https://local.invalid:444', 'file://local.invalid'])('rejects missing/foreign origin %s', async origin => {
 expect((await POST(request(valid, token, origin))).status).toBe(403); expect(query).not.toHaveBeenCalled();
});
test.each(['__proto__', 'constructor', 'registrations.getById', 'applicantAuth.createLoginToken', 'matches.create', 'interestTestReset.reset'])('rejects non-allowlisted function %s', async name => {
 expect((await POST(request({ ...valid, name }))).status).toBe(400); expect(query).not.toHaveBeenCalled(); expect(mutation).not.toHaveBeenCalled();
});
test.each(['adminSecret', 'password', 'sessionHash', 'token'])('rejects injected credential %s', async key => {
 expect((await POST(request({ ...valid, args: { [key]: 'forged' } }))).status).toBe(400); expect(query).not.toHaveBeenCalled();
});
test('authorized query injects only server credential and disables caching', async () => {
 const response = await POST(request()); expect(response.status).toBe(200);
 expect(query).toHaveBeenCalledExactlyOnceWith(api.registrations.getAll, { adminSecret: 'synthetic-service-secret' });
 expect(response.headers.get('cache-control')).toBe('private, no-store'); expect(await response.json()).toEqual({ result: [] });
});
test('authorized mutation preserves arguments and injects service credential', async () => {
 const response = await POST(request({ kind: 'mutation', name: 'settings.set', args: { key: 'admin_name', value: 'Admin' } }));
 expect(response.status).toBe(200); expect(mutation).toHaveBeenCalledExactlyOnceWith(api.settings.set, { key: 'admin_name', value: 'Admin', adminSecret: 'synthetic-service-secret' });
});
test('fails closed with unconfigured credential', async () => {
 vi.stubEnv('ATTENDANCE_ADMIN_SECRET', ''); expect((await POST(request())).status).toBe(503); expect(query).not.toHaveBeenCalled();
});
test('backend validator failures never disclose credentials', async () => {
 query.mockRejectedValue(new Error('ArgumentValidationError adminSecret synthetic-service-secret'));
 const response = await POST(request()); expect(response.status).toBe(400); expect(await response.text()).not.toContain('synthetic-service-secret');
});
test('operation kind cannot be used to switch allowlists', async () => {
 expect((await POST(request({ ...valid, kind: 'mutation' }))).status).toBe(400); expect(mutation).not.toHaveBeenCalled();
});

for (const operation of [valid, { kind: 'mutation', name: 'settings.set', args: { key: 'admin_name', value: 'Synthetic' } }]) {
 test(`${operation.kind} temporary upstream failure is retryable and subsequent requests recover`, async () => {
  const upstream = operation.kind === 'query' ? query : mutation;
  upstream.mockResolvedValueOnce('loaded').mockRejectedValueOnce(new TypeError('fetch failed', { cause: new Error('synthetic-service-secret private backend address') })).mockResolvedValueOnce('recovered');
  expect(await (await POST(request(operation))).json()).toEqual({ result: 'loaded' });
  const failure = await POST(request(operation));
  expect(failure.status).toBe(503);
  expect(failure.headers.get('cache-control')).toBe('private, no-store');
  expect(await failure.json()).toEqual({ error: 'Admin service temporarily unavailable. Please try again.' });
  expect(await (await POST(request(operation))).json()).toEqual({ result: 'recovered' });
  expect(upstream).toHaveBeenCalledTimes(3);
 });
}
test.each(['AbortError', 'TimeoutError'])('upstream %s remains retryable and redacted', async name => {
 const failure = new Error('synthetic-service-secret private backend failure'); failure.name = name;
 query.mockRejectedValue(failure);
 const response = await POST(request());
 expect(response.status).toBe(503);
 expect(await response.text()).not.toMatch(/synthetic-service-secret|private backend/);
});
test.each([new TypeError('Invalid argument synthetic-service-secret'), new Error('Unauthorized'), new Error('ArgumentValidationError fetch failed synthetic-service-secret')])('non-transport backend failures stay non-retryable and redacted %#', async error => {
 query.mockRejectedValue(error);
 const response = await POST(request());
 expect(response.status).toBe(400);
 expect(await response.json()).toEqual({ error: 'Unable to complete admin request. Refresh and try again.' });
});

test('mutual scan is admin-only and publishes no partial result on later-page failure', async () => {
 const operation = { kind: 'query', name: 'interests.getAll', args: {} };
 expect((await POST(request(operation, ''))).status).toBe(401);
 expect(query).not.toHaveBeenCalled();
 query.mockResolvedValueOnce({page: [], isDone: false, continueCursor: 'next'}).mockRejectedValueOnce(new Error('second page failed'));
 const response = await POST(request(operation));
 expect(response.status).toBe(400); expect(await response.json()).not.toHaveProperty('result');
 expect(query).toHaveBeenCalledTimes(2); expect(mutation).not.toHaveBeenCalled();
});
test('mutual scan follows all pages without reverse per-row queries', async () => {
 query.mockResolvedValueOnce({page: [], isDone: false, continueCursor: 'next'}).mockResolvedValueOnce({page: [], isDone: true, continueCursor: ''}).mockResolvedValueOnce({page: [], isDone: true, continueCursor: ''});
 const response = await POST(request({kind:'query',name:'interests.getAll',args:{}}));
 expect(response.status).toBe(200); expect(await response.json()).toEqual({result:[]});
 expect(query).toHaveBeenCalledTimes(3);
 expect(query.mock.calls[1][1].paginationOpts.cursor).toBe('next');
});
