import { NextRequest } from 'next/server';
import { adminQueries, adminMutations } from '@/lib/admin-operations';
import { adminRequestError, getAdminSecret, privateJson } from '@/lib/admin-server';
import { getConvexClient } from '@/lib/convex';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
 const denied = adminRequestError(request);
 if (denied) return denied;
 try {
  const body = await request.json();
  if (!body || !['query', 'mutation'].includes(body.kind) || typeof body.name !== 'string' || !body.args || typeof body.args !== 'object' || Array.isArray(body.args) || Object.keys(body).some(key => !['kind', 'name', 'args'].includes(key))) return privateJson({ error: 'Invalid admin request' }, 400);
  if (Object.keys(body.args).some(key => /secret|password|token|sessionHash/i.test(key))) return privateJson({ error: 'Client credentials are not accepted' }, 400);
  const client = getConvexClient();
  const args = { ...body.args, adminSecret: getAdminSecret() };
  let result;
  if (body.kind === 'query' && Object.prototype.hasOwnProperty.call(adminQueries, body.name)) {
   result = await client.query(adminQueries[body.name as keyof typeof adminQueries], args);
  } else if (body.kind === 'mutation' && Object.prototype.hasOwnProperty.call(adminMutations, body.name)) {
   result = await client.mutation(adminMutations[body.name as keyof typeof adminMutations], args);
  } else return privateJson({ error: 'Operation not allowed' }, 400);
  return privateJson({ result: result ?? null });
 } catch (error) {
  if (error instanceof Error && (
   (error instanceof TypeError && /^(fetch failed|failed to fetch|networkerror when attempting to fetch resource\.?)$/i.test(error.message)) ||
   error.name === 'TimeoutError' || error.name === 'AbortError'
  )) return privateJson({ error: 'Admin service temporarily unavailable. Please try again.' }, 503);
  // Validator errors may contain credential-bearing arguments.
  return privateJson({ error: 'Unable to complete admin request. Refresh and try again.' }, 400);
 }
}
