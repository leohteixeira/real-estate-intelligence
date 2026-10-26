import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import type { AskVisitorAdmission } from '@rei/application';
import type { AskConfig } from './ask.config';

const lifetimeSeconds = 30 * 24 * 60 * 60;
/** Browser identity is independent of thread authority and never enters a public document. */
export function askVisitorAdmission(
  request: Pick<Request, 'headers'>,
  response: Pick<Response, 'cookie'> | undefined,
  config: AskConfig,
  now = Date.now(),
): AskVisitorAdmission {
  if (!config.secret) throw new Error('Ask visitor signing unavailable.');
  const name = config.production ? '__Secure-rei_ask_visitor' : 'rei_ask_visitor';
  const signingKey = createHmac('sha256', config.secret)
    .update('rei:ask:visitor-cookie:v1')
    .digest();
  const sign = (payload: string) =>
    createHmac('sha256', signingKey).update(payload).digest('base64url');
  const values = (request.headers.cookie ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`))
    .map((part) => part.slice(name.length + 1));
  const value = values.length === 1 ? values[0]! : '';
  const parts = /^v1\.([A-Za-z0-9_-]{43})\.([0-9]{10})\.([0-9]{10})\.([A-Za-z0-9_-]{43})$/.exec(
    value,
  );
  const seconds = Math.floor(now / 1000);
  let identity: string;
  if (
    parts &&
    Number(parts[2]) <= seconds &&
    Number(parts[3]) > seconds &&
    Number(parts[3]) - Number(parts[2]) === lifetimeSeconds &&
    timingSafeEqual(
      Buffer.from(parts[4]!),
      Buffer.from(sign(value.slice(0, value.lastIndexOf('.')))),
    )
  ) {
    identity = parts[1]!;
  } else {
    identity = randomBytes(32).toString('base64url');
    const payload = `v1.${identity}.${seconds}.${seconds + lifetimeSeconds}`;
    response?.cookie(name, `${payload}.${sign(payload)}`, {
      httpOnly: true,
      sameSite: 'strict',
      secure: config.production,
      path: config.production ? '/real-estate-intelligence/' : '/',
      maxAge: lifetimeSeconds * 1000,
      expires: new Date(now + lifetimeSeconds * 1000),
    });
  }
  return {
    visitorDigest: createHash('sha256').update(`rei:ask:visitor:v1:${identity}`).digest('hex'),
  };
}
