import { timingSafeEqual } from 'node:crypto';

export function authorizeExecution(
  token: string | undefined,
  header: string | string[] | undefined,
): 200 | 401 | 503 {
  if (!token) return 503;
  if (typeof header !== 'string' || !/^Bearer [A-Za-z0-9_-]{32,128}$/.test(header)) return 401;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(token);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected) ? 200 : 401;
}
