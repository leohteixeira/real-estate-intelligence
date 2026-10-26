import { SpanStatusCode, trace } from '@opentelemetry/api';
import { randomBytes } from 'node:crypto';
import { experimental_decide as decide } from 'ai';
import { createGateway } from '@ai-sdk/gateway';
import { gatewayFailure } from './gateway-failure';
import {
  askIntents,
  parseIntentDecision,
  type AskIntent,
  type IntentDecision,
} from '@rei/contracts';
import {
  verifyGatewayAcknowledgement,
  gatewayCostUsd,
  assertGatewayPrivacy,
  type GatewayPrivacyEvidence,
} from './gateway-privacy.verifier';
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
export const intentCriteria = Object.freeze({
  price_per_square_meter:
    'Calculate asking price per square meter from a stated price and area; cálculo de preço por metro quadrado.',
  listing_search: 'Find or search property listings matching criteria; buscar anúncios ou imóveis.',
  property_history:
    'History or changes for a particular property or listing; histórico de um imóvel.',
  region_statistics:
    'Aggregate market statistics for a region; estatísticas, média ou mediana de uma região.',
  comparables: 'Find comparable properties or compare properties; imóveis comparáveis.',
  unsupported:
    'Anything outside these real estate capabilities, or no actionable real estate intent.',
});
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
/** Each SDK invocation sends once. A public probe precedes user-bearing classification. */
export class GatewayIntentDecider implements IntentDecider {
  public constructor(
    private readonly apiKey: string | undefined,
    private readonly sdkDecide: typeof decide = decide,
    private readonly gatewayFactory: typeof createGateway = createGateway,
  ) {}
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
    if (!this.apiKey) throw new ModelExplanationFailure('policy');
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
    const model = 'typesafe-ai/jev';
    const questions = {
      intent: {
        type: 'choice' as const,
        instructions: 'Choose exactly one real estate intent; do not infer operands.',
        criteria: intentCriteria,
      },
    };
    const gateway = this.gatewayFactory({ apiKey: this.apiKey }).evaluation(model);
    // The pinned Gateway evaluation alias predates AI SDK's normalized text parts.
    // Project only our text-only capability into its typed doEvaluate contract.
    const call = (state: string, attemptSignal: AbortSignal) =>
      this.sdkDecide({
        model: {
          specificationVersion: 'v4',
          provider: gateway.provider,
          modelId: model,
          supportedQuestionTypes: ['choice'],
          doDecide: async (options) => {
            const text = options.state
              .map((part) => {
                if (part.type !== 'text') throw new ModelExplanationFailure('rejected');
                return part.text;
              })
              .join('');
            const result = await gateway.doEvaluate({
              state: text,
              questions,
              abortSignal: options.abortSignal,
              headers: options.headers,
              providerOptions: options.providerOptions,
            });
            // Reject before the SDK warning logger can emit provider-supplied payloads.
            if (result.warnings.length) throw new ModelExplanationFailure('policy');
            return result;
          },
        },
        state,
        questions,
        maxRetries: 0,
        abortSignal: attemptSignal,
        providerOptions: { gateway: { zeroDataRetention: true } },
        telemetry: { isEnabled: false, recordInputs: false, recordOutputs: false },
      });
    const physicalCall = (state: string, privacy?: GatewayPrivacyEvidence) => {
      const work = async (attemptSignal: AbortSignal) => {
        if (privacy) assertGatewayPrivacy(privacy, model, Date.now());
        if (bounded.aborted || Date.now() >= deadlineAt)
          throw new ModelExplanationFailure('cancelled');
        try {
          return await trace.getTracer('rei.ai.intent-decision').startActiveSpan(
            'ask.decision.attempt',
            {
              attributes: {
                'rei.ai.model': model,
                'rei.ai.provider': 'vercel-ai-gateway',
                'rei.ai.route': 'vercel-ai-gateway',
                'rei.ai.attempt.purpose': privacy ? 'decision' : 'privacy-probe',
                'rei.ai.usage': 'unavailable',
                'rei.ai.cost': 'unavailable',
              },
            },
            async (span) => {
              const started = performance.now();
              try {
                const result = await call(state, attemptSignal);
                const cost = gatewayCostUsd(result.providerMetadata);
                if (cost !== null)
                  span.setAttributes({ 'rei.ai.cost': 'available', 'rei.ai.cost_usd': cost });
                span.setStatus({ code: SpanStatusCode.OK });
                return result;
              } catch (error) {
                span.setStatus({ code: SpanStatusCode.ERROR });
                throw error;
              } finally {
                span.setAttribute('rei.ai.duration_ms', Math.max(0, performance.now() - started));
                span.end();
              }
            },
          );
        } catch (error) {
          throw gatewayFailure(error, attemptSignal);
        }
      };
      return attempts ? attempts.execute(work, bounded, deadlineAt) : work(bounded);
    };
    const acknowledgement = (result: Awaited<ReturnType<typeof call>>) => ({
      model: result.response.modelId,
      route: 'vercel-ai-gateway' as const,
      metadata: result.providerMetadata,
      warnings: result.warnings ?? [],
    });
    try {
      const probe = await physicalCall(
        'Public privacy capability probe: determine the intent of the fixed sentence "hello".',
      );
      bounded.throwIfAborted();
      verifyGatewayAcknowledgement(acknowledgement(probe), model);
      const verifiedAt = Date.now();
      const evidence: GatewayPrivacyEvidence = {
        id: randomBytes(18).toString('base64url'),
        model,
        route: 'vercel-ai-gateway',
        policy: 'gateway-zdr-routing-v1',
        verifiedAt,
        expiresAt: verifiedAt + modelExplanationSettings.evidenceTtlMs,
      };
      assertGatewayPrivacy(evidence, model, Date.now());
      bounded.throwIfAborted();
      const result = await physicalCall(query, evidence);
      bounded.throwIfAborted();
      verifyGatewayAcknowledgement(acknowledgement(result), model);
      const answer = result.answers.intent;
      try {
        return parseIntentDecision({
          intent: answer.choice,
          probability: answer.probabilities?.[answer.choice],
          probabilities: answer.probabilities,
          source: 'gateway-jev-v1',
          degraded: false,
          taxonomyVersion: 'ask-intents-v1',
          privacyEvidenceId: evidence.id,
        });
      } catch {
        throw new ModelExplanationFailure('rejected');
      }
    } catch (error) {
      if (signal.aborted || Date.now() >= deadlineAt)
        throw new ModelExplanationFailure('cancelled');
      if (bounded.aborted) throw new ModelExplanationFailure('transient');
      throw gatewayFailure(error, signal);
    }
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
