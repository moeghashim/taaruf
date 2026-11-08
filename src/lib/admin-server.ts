// Node-only crypto prevents this module from being bundled for browsers.
import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
export function getAdminSecret(): string {
 if (typeof window !== 'undefined') throw new Error('Server only');
 const secret = process.env.ATTENDANCE_ADMIN_SECRET;
 if (!secret) throw new Error('Admin service not configured');
 return secret;
}
export function privateJson(value: unknown, status = 200) {
 return NextResponse.json(value, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Origin' } });
}
export function adminRequestError(request: NextRequest): NextResponse | null {
 const password = process.env.ADMIN_PASSWORD;
 const token = request.cookies.get('admin_token')?.value;
 const expected = password ? crypto.createHash('sha256').update(password + (process.env.ADMIN_TOKEN_SALT || 'taaruf-admin-salt')).digest('hex') : '';
 if (!expected || !token || !/^[a-f0-9]{64}$/.test(token) || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) return privateJson({ error: 'Your admin session has expired. Sign in again.' }, 401);
 try {
  const origin = new URL(request.headers.get('origin') || '');
  if (!['http:', 'https:'].includes(origin.protocol) || origin.protocol !== request.nextUrl.protocol || origin.host !== (request.headers.get('host') || request.nextUrl.host)) throw new Error();
 } catch { return privateJson({ error: 'Invalid request origin.' }, 403); }
 if (!process.env.ATTENDANCE_ADMIN_SECRET) return privateJson({ error: 'Admin service not configured' }, 503);
 return null;
}
