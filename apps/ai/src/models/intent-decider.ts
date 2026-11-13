import type Anthropic from '@anthropic-ai/sdk';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import {
  askIntents,
  parseIntentDecision,
  type AskIntent,
  type IntentDecision,
} from '@rei/contracts';
import {
  anthropicClient,
  completedText,
  sameAnthropicModel,
  type AnthropicFetch,
} from './anthropic-client';
import { anthropicFailure } from './anthropic-failure';
import {
  INTENT_CLASSIFIER_MAX_TOKENS,
  INTENT_CLASSIFIER_MODEL,
  INTENT_CLASSIFIER_PROMPT,
  INTENT_CLASSIFIER_SCHEMA,
  INTENT_CLASSIFIER_SOURCE,
  intentClassifierInput,
} from './intent-classifier.prompt';
import { ModelExplanationFailure } from './language-model.port';
import { modelExplanationSettings } from './model-explanation.settings';

export const INTENT_DECIDER = Symbol('INTENT_DECIDER');
/** Structural implementation of the application-owned IntentDecider capability. */
export interface IntentDecider {
  decide(
    query: string,
    locale: 'en' | 'pt-BR',
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<IntentDecision>;
}
export { intentCriteria } from './intent-classifier.prompt';
export function heuristicDecision(query: string): IntentDecision {
  const text = query.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const matches: AskIntent[] = [];
  if (
    /(?:price|preco|valor).*(?:square met|metro quadrado|m[²2])|(?:price|preco|valor).*(?:area)/.test(
      text,
    )
  )
    matches.push('price_per_square_meter');
  if (/\b(?:find|search|listings|buscar|busque|encontrar|anuncios)\b/.test(text))
    matches.push('listing_search');
  if (/\b(?:history|historico|historica|changes)\b/.test(text)) matches.push('property_history');
  if (/\b(?:statistics|estatisticas|median|mediana|average|media)\b/.test(text))
    matches.push('region_statistics');
  if (/\b(?:comparables|comparable|comparaveis|compare|comparar)\b/.test(text))
    matches.push('comparables');
  const intent = matches[0] ?? 'unsupported';
  const probability = matches.length === 1 ? 0.9 : 0.6;
  const probabilities = Object.fromEntries(
    askIntents.map((label) => [label, label === intent ? probability : (1 - probability) / 5]),
  );
  return parseIntentDecision({
    intent,
    probability,
    probabilities,
    source: 'heuristic-v1',
    degraded: true,
    taxonomyVersion: 'ask-intents-v1',
    privacyEvidenceId: null,
  });
}
export interface IntentAttemptPolicy {
  execute<T>(
    work: (signal: AbortSignal) => Promise<T>,
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<T>;
}
/** Bounded usage of one physical classification request; never its text. */
export interface IntentAttemptMeasurement {
  readonly latencyMs: number;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
}
function tokenCount(usage: unknown, field: 'input_tokens' | 'output_tokens'): number | null {
  if (typeof usage !== 'object' || usage === null || !(field in usage)) return null;
  const value = (usage as Record<string, unknown>)[field];
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
/**
 * One Messages API request classifies the visitor question with a closed structured output.
 * The reported probability is the model's own stated confidence, not a calibrated measurement;
 * the remaining mass is spread evenly so the retained distribution keeps its closed shape.
 */
export class AnthropicIntentDecider implements IntentDecider {
  readonly #client: Anthropic | undefined;
  public constructor(
    apiKey: string | undefined,
    fetch?: AnthropicFetch,
    private readonly observe: (attempt: IntentAttemptMeasurement) => void = () => undefined,
  ) {
    this.#client = apiKey ? anthropicClient(apiKey, fetch) : undefined;
  }
  public async decide(
    query: string,
    _locale: 'en' | 'pt-BR',
    signal: AbortSignal,
    deadlineAt: number,
    attempts?: IntentAttemptPolicy,
  ): Promise<IntentDecision> {
    void _locale;
    signal.throwIfAborted();
    if (!Number.isFinite(deadlineAt) || deadlineAt <= Date.now())
      throw new ModelExplanationFailure('cancelled');
    const client = this.#client;
    if (!client) throw new ModelExplanationFailure('policy');
    const bounded = AbortSignal.any([
      signal,
      AbortSignal.timeout(
        Math.min(
          2147483647,
          Math.ceil(
            attempts
              ? deadlineAt - Date.now()
              : Math.min(deadlineAt - Date.now(), modelExplanationSettings.timeoutMs),
          ),
        ),
      ),
    ]);
    const work = async (attemptSignal: AbortSignal): Promise<unknown> => {
      if (bounded.aborted || Date.now() >= deadlineAt)
        throw new ModelExplanationFailure('cancelled');
      try {
        return await trace.getTracer('rei.ai.intent-decision').startActiveSpan(
          'ask.decision.attempt',
          {
            attributes: {
              'rei.ai.model': INTENT_CLASSIFIER_MODEL,
              'rei.ai.provider': modelExplanationSettings.provider,
              'rei.ai.route': modelExplanationSettings.route,
              'rei.ai.attempt.purpose': 'decision',
              'rei.ai.usage': 'unavailable',
              'rei.ai.cost': 'unavailable',
            },
          },
          async (span) => {
            const started = performance.now();
            let usage: unknown;
            try {
              const message: unknown = await client.messages.create(
                {
                  model: INTENT_CLASSIFIER_MODEL,
                  max_tokens: INTENT_CLASSIFIER_MAX_TOKENS,
                  // A short label within a 3.5-second attempt: no reasoning tokens.
                  thinking: { type: 'disabled' },
                  output_config: {
                    effort: 'low',
                    format: { type: 'json_schema', schema: INTENT_CLASSIFIER_SCHEMA },
                  },
                  system: INTENT_CLASSIFIER_PROMPT,
                  messages: [{ role: 'user', content: intentClassifierInput(query) }],
                },
                { signal: attemptSignal, maxRetries: 0 },
              );
              if (typeof message === 'object' && message !== null && 'usage' in message)
                usage = message.usage;
              const inputTokens = tokenCount(usage, 'input_tokens');
              const outputTokens = tokenCount(usage, 'output_tokens');
              if (inputTokens !== null && outputTokens !== null)
                span.setAttributes({
                  'rei.ai.usage': 'available',
                  'rei.ai.input_tokens': inputTokens,
                  'rei.ai.output_tokens': outputTokens,
                });
              span.setStatus({ code: SpanStatusCode.OK });
              return message;
            } catch (error) {
              span.setStatus({ code: SpanStatusCode.ERROR });
              throw error;
            } finally {
              const latencyMs = Math.max(0, performance.now() - started);
              span.setAttribute('rei.ai.duration_ms', latencyMs);
              span.end();
              this.observe({
                latencyMs,
                inputTokens: tokenCount(usage, 'input_tokens'),
                outputTokens: tokenCount(usage, 'output_tokens'),
              });
            }
          },
        );
      } catch (error) {
        throw anthropicFailure(error, attemptSignal);
      }
    };
    try {
      const message = await (attempts
        ? attempts.execute(work, bounded, deadlineAt)
        : work(bounded));
      bounded.throwIfAborted();
      return classified(message);
    } catch (error) {
      if (signal.aborted || Date.now() >= deadlineAt)
        throw new ModelExplanationFailure('cancelled');
      if (bounded.aborted) throw new ModelExplanationFailure('transient');
      throw anthropicFailure(error, signal);
    }
  }
}

/** Convert the vendor message to the canonical decision; nonconforming output is definitive. */
function classified(message: unknown): IntentDecision {
  if (typeof message !== 'object' || message === null)
    throw new ModelExplanationFailure('rejected');
  // A safety refusal is the provider declining the request, not a malformed label.
  if ('stop_reason' in message && message.stop_reason === 'refusal')
    throw new ModelExplanationFailure('policy');
  const text = completedText(message);
  if (
    text === undefined ||
    !('model' in message) ||
    !sameAnthropicModel(INTENT_CLASSIFIER_MODEL, message.model)
  )
    throw new ModelExplanationFailure('rejected');
  try {
    const answer: unknown = JSON.parse(text);
    if (
      typeof answer !== 'object' ||
      answer === null ||
      Object.keys(answer).length !== 2 ||
      !('intent' in answer) ||
      !('probability' in answer) ||
      typeof answer.probability !== 'number'
    )
      throw new ModelExplanationFailure('rejected');
    const { intent, probability } = answer;
    return parseIntentDecision({
      intent,
      probability,
      probabilities: Object.fromEntries(
        askIntents.map((label) => [label, label === intent ? probability : (1 - probability) / 5]),
      ),
      source: INTENT_CLASSIFIER_SOURCE,
      degraded: false,
      taxonomyVersion: 'ask-intents-v1',
      privacyEvidenceId: null,
    });
  } catch {
    throw new ModelExplanationFailure('rejected');
  }
}
/** Degradation changes provenance, never the confidence threshold or cancellation contract. */
export class DegradedIntentDecider implements IntentDecider {
  public constructor(private readonly primary: IntentDecider) {}
  public async decide(
    query: string,
    locale: 'en' | 'pt-BR',
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<IntentDecision> {
    signal.throwIfAborted();
    try {
      return parseIntentDecision(await this.primary.decide(query, locale, signal, deadlineAt));
    } catch (error) {
      signal.throwIfAborted();
      if (
        Date.now() >= deadlineAt ||
        !(error instanceof ModelExplanationFailure) ||
        error.kind === 'cancelled' ||
        error.kind === 'rejected'
      )
        throw error;
      return heuristicDecision(query);
    }
  }
}
