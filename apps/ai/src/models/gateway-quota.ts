import { GatewayError } from '@ai-sdk/gateway';
import { APICallError } from 'ai';

const MAX_ERROR_BODY_CHARACTERS = 4096;

/** Inspect only documented structured discriminants; never messages, URLs or request bodies. */
export function exhaustedGatewayQuota(error: unknown): boolean {
  const cause = GatewayError.isInstance(error) ? error.cause : error;
  if (!APICallError.isInstance(cause)) return false;
  let data: unknown = cause.data;
  if (data === undefined && cause.responseBody !== undefined) {
    if (cause.responseBody.length > MAX_ERROR_BODY_CHARACTERS) return false;
    try {
      data = JSON.parse(cause.responseBody);
    } catch {
      return false;
    }
  }
  if (typeof data !== 'object' || data === null || !('error' in data)) return false;
  const details = data.error;
  if (typeof details !== 'object' || details === null) return false;
  const type = 'type' in details ? details.type : undefined;
  const code = 'code' in details ? details.code : undefined;
  // Gateway's budget/credit errors can be wrapped as GatewayInternalServerError in SDK 7.
  if (cause.statusCode === 402)
    return type === 'quota_for_entity_exceeded' || type === 'insufficient_funds';
  // Structured provider quota codes are distinct from ordinary 429 rate limiting.
  if (cause.statusCode === 429)
    return (
      type === 'insufficient_quota' ||
      code === 'insufficient_quota' ||
      code === 'credit_balance_exhausted' ||
      code === 'organization_usage_limit_exceeded'
    );
  return false;
}
