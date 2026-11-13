import Anthropic from '@anthropic-ai/sdk';

export type AnthropicFetch = NonNullable<ConstructorParameters<typeof Anthropic>[0]>['fetch'];

/**
 * The only place that builds the provider client. The origin and credential are pinned so that no
 * ambient `ANTHROPIC_BASE_URL` or `ANTHROPIC_AUTH_TOKEN` can reroute a request, the SDK never
 * retries (retry belongs to the named resilience policies) and the SDK never logs.
 */
export function anthropicClient(apiKey: string, fetch?: AnthropicFetch): Anthropic {
  return new Anthropic({
    apiKey,
    authToken: null,
    baseURL: 'https://api.anthropic.com',
    maxRetries: 0,
    logLevel: 'off',
    ...(fetch ? { fetch } : {}),
  });
}

/** Text blocks only; a refusal, truncation or any other stop is never treated as an answer. */
export function completedText(message: unknown): string | undefined {
  if (typeof message !== 'object' || message === null) return undefined;
  if (!('stop_reason' in message) || message.stop_reason !== 'end_turn') return undefined;
  if (!('content' in message) || !Array.isArray(message.content)) return undefined;
  let text = '';
  for (const block of message.content as unknown[]) {
    if (typeof block !== 'object' || block === null || !('type' in block)) return undefined;
    if (block.type !== 'text') continue;
    if (!('text' in block) || typeof block.text !== 'string') return undefined;
    text += block.text;
  }
  return text;
}

/** The API answers with the requested identifier or a dated snapshot of the same model. */
export function sameAnthropicModel(requested: string, answered: unknown): boolean {
  return (
    typeof answered === 'string' &&
    (answered === requested ||
      (answered.startsWith(`${requested}-`) &&
        /^\d{8}$/.test(answered.slice(requested.length + 1))))
  );
}
