import type Anthropic from '@anthropic-ai/sdk';
import {
  ModelExplanationFailure,
  type LanguageModel,
  type LanguageModelRequest,
  type LanguageModelResult,
} from './language-model.port';
import {
  anthropicClient,
  completedText,
  sameAnthropicModel,
  type AnthropicFetch,
} from './anthropic-client';
import { anthropicFailure } from './anthropic-failure';
import { modelExplanationSettings as settings } from './model-explanation.settings';

/** One Messages API request per call: no SDK retries, tools, caching or payload telemetry. */
export class AnthropicLanguageModelAdapter implements LanguageModel {
  readonly #client: Anthropic | undefined;
  public constructor(apiKey: string | undefined, fetch?: AnthropicFetch) {
    this.#client = apiKey ? anthropicClient(apiKey, fetch) : undefined;
  }
  public async generate(
    request: LanguageModelRequest,
    signal: AbortSignal,
  ): Promise<LanguageModelResult> {
    if (signal.aborted) throw new ModelExplanationFailure('cancelled');
    if (!this.#client || request.route !== settings.route)
      throw new ModelExplanationFailure('policy');
    try {
      const message: unknown = await this.#client.messages.create(
        {
          model: request.model,
          max_tokens: request.maxOutputTokens,
          // The persisted token reservation bounds all generated output, so the model must not
          // spend it on reasoning: the task is to return the supplied sentences verbatim.
          thinking: { type: 'disabled' },
          output_config: { effort: 'low' },
          messages: [{ role: 'user', content: request.prompt }],
        },
        { signal, maxRetries: 0 },
      );
      signal.throwIfAborted();
      return canonical(message, request);
    } catch (error) {
      throw anthropicFailure(error, signal);
    }
  }
}

/** Convert the vendor message to the port shape; the response is untrusted until it conforms. */
function canonical(message: unknown, request: LanguageModelRequest): LanguageModelResult {
  if (typeof message !== 'object' || message === null)
    throw new ModelExplanationFailure('rejected');
  // A safety refusal is the provider declining the request, not malformed output.
  if ('stop_reason' in message && message.stop_reason === 'refusal')
    throw new ModelExplanationFailure('policy');
  const text = completedText(message);
  const usage = 'usage' in message ? message.usage : undefined;
  const outputTokens =
    typeof usage === 'object' && usage !== null && 'output_tokens' in usage
      ? usage.output_tokens
      : undefined;
  if (
    text === undefined ||
    !('model' in message) ||
    !sameAnthropicModel(request.model, message.model)
  )
    throw new ModelExplanationFailure('rejected');
  return {
    text,
    outputTokens: typeof outputTokens === 'number' ? outputTokens : undefined,
    model: request.model,
    route: request.route,
  };
}
