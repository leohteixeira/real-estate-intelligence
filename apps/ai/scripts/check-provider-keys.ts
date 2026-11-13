// Checks that the Anthropic API key works: one small request.
// Prints the provider, the model and the outcome. Never prints a key, a header or a prompt.
//
//   pnpm --filter @rei/ai run check:keys

import Anthropic from '@anthropic-ai/sdk';

const PROMPT = 'Reply with the single word OK.';
const MAX_TOKENS = 256;
const TIMEOUT_MS = 30_000;

function report(provider, ok, detail) {
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${provider}: ${detail}`);
  return ok;
}

async function checkAnthropic() {
  const provider = 'Anthropic';
  if (!process.env.ANTHROPIC_API_KEY) return report(provider, false, 'ANTHROPIC_API_KEY is empty');

  const model = process.env.ANTHROPIC_CHECK_MODEL ?? 'claude-haiku-5-5';
  const client = new Anthropic({ maxRetries: 0, timeout: TIMEOUT_MS });
  try {
    const message = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content: PROMPT }],
    });
    const text = message.content.find((block) => block.type === 'text')?.text ?? '';
    return report(provider, true, `model ${message.model}, replied "${text.trim().slice(0, 20)}"`);
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return report(provider, false, 'HTTP 401: the key was rejected');
    }
    if (error instanceof Anthropic.PermissionDeniedError) {
      return report(provider, false, `HTTP 403: the key may not use model ${model}`);
    }
    if (error instanceof Anthropic.NotFoundError) {
      return report(provider, false, `HTTP 404: model ${model} not found`);
    }
    if (error instanceof Anthropic.RateLimitError) {
      return report(provider, false, 'HTTP 429: rate limited, but the key was accepted');
    }
    if (error instanceof Anthropic.APIError) {
      return report(
        provider,
        false,
        `HTTP ${error.status ?? 'none'} (${error.type ?? error.name})`,
      );
    }
    throw error;
  }
}

process.exit((await checkAnthropic()) ? 0 : 1);
