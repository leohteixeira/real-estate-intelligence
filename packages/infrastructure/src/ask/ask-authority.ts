import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { AskRequestedIdentity } from '@rei/domain';
export function askDigest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
export function askDispatchProof(secret: string, identity: AskRequestedIdentity): string {
  return createHmac('sha256', secret)
    .update(JSON.stringify([identity.version, identity.eventId, identity.runId, identity.threadId]))
    .digest('base64url');
}
export function equalAskDigest(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
