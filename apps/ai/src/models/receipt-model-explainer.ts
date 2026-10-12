import { randomBytes } from 'node:crypto';
import {
  BulkheadPolicy,
  CircuitBreakerPolicy,
  FallbackPolicy,
  OutboundRateLimitPolicy,
  OutboundRateLimitError,
  ResiliencePolicy,
  RetryPolicy,
  TimeoutPolicy,
} from '@nestjs/resilience';
import {
  explanationFacts,
  MODEL_EXPLANATION_GRAMMAR,
  MODEL_EXPLANATION_PROMPT,
  sameModelExplanation,
  validExplanationText,
  validModelExplanation,
} from '@rei/domain';
import {
  parseModelExplanation,
  parseModelExplanationResponse,
  type ModelExplanation,
  type ModelExplanationRequest,
  type ModelAttemptReservation,
  type PriceToolReceipt,
} from '@rei/contracts';
import {
  ModelExplanationFailure,
  type LanguageModel,
  type LanguageModelResult,
} from './language-model.port';
import {
  assertGatewayPrivacy,
  verifyGatewayAcknowledgement,
  type GatewayPrivacyEvidence,
} from './gateway-privacy.verifier';
import type {
  ModelExplainer,
  ModelExplanationContext,
  ModelExplanationTransport,
} from './model-explanation.port';
import { modelExplanationSettings as settings } from './model-explanation.settings';
import { eligibleModelFallback, modelFailure, recordModelFailure } from './model-failure';
import { modelAttemptSpan } from './model-telemetry';

/** Persistent reservations precede every outbound attempt, including public privacy probes. */
export class ReceiptModelExplainer implements ModelExplainer {
  readonly #bulkhead: BulkheadPolicy;
  readonly #breakers: ReadonlyMap<string, CircuitBreakerPolicy>;
  readonly #attempt: ResiliencePolicy;
  public constructor(
    private readonly model: LanguageModel,
    private readonly transport: ModelExplanationTransport,
    private readonly now: () => number = Date.now,
  ) {
    this.#bulkhead = new BulkheadPolicy({ name: settings.policies.bulkhead, ...settings.bulkhead });
    this.#breakers = new Map(
      [settings.primary, settings.secondary].map((model) => [
        `${settings.route}:${model}`,
        new CircuitBreakerPolicy({
          name: `${settings.policies.circuitBreaker}.${settings.route}.${model}`,
          ...settings.breaker,
          recordIf: recordModelFailure,
        }),
      ]),
    );
    this.#attempt = ResiliencePolicy.wrap(
      new RetryPolicy({ name: settings.policies.retry, attempts: 1, retryIf: () => false }),
      new OutboundRateLimitPolicy({ name: settings.policies.rateLimit, ...settings.rateLimit }),
      new TimeoutPolicy({ name: settings.policies.timeout, timeout: settings.timeoutMs }),
    );
  }
  public async explain(
    receipt: PriceToolReceipt,
    context: ModelExplanationContext,
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<ModelExplanation> {
    this.live(signal, deadlineAt);
    const existing = await this.execute(
      { ...this.identity(context), operation: 'get' },
      context,
      signal,
      deadlineAt,
    );
    if (existing.operation !== 'get') throw new ModelExplanationFailure('rejected');
    if (existing.explanation) {
      if (!validModelExplanation(existing.explanation, receipt, context.locale))
        throw new ModelExplanationFailure('rejected');
      return existing.explanation;
    }
    const fallback = new FallbackPolicy<ModelExplanation>(
      async (_error, { signal: admitted }) => {
        this.live(admitted, deadlineAt);
        // A lost acceptance response is ambiguous: recover before any fallback spend.
        const recovered = await this.execute(
          { ...this.identity(context), operation: 'get' },
          context,
          admitted,
          deadlineAt,
        );
        if (recovered.operation !== 'get') throw new ModelExplanationFailure('rejected');
        if (recovered.explanation) {
          if (!validModelExplanation(recovered.explanation, receipt, context.locale))
            throw new ModelExplanationFailure('rejected');
          return recovered.explanation;
        }
        return this.#bulkhead.execute(
          ({ signal: secondary }) =>
            this.generate(settings.secondary, receipt, context, secondary, deadlineAt),
          { signal: admitted, source: 'ReceiptModelExplainer' },
        );
      },
      { name: settings.policies.fallback, handleIf: eligibleModelFallback },
    );
    try {
      return await fallback.execute(
        ({ signal: admitted }) =>
          this.#bulkhead.execute(
            ({ signal: primary }) =>
              this.generate(settings.primary, receipt, context, primary, deadlineAt),
            { signal: admitted, source: 'ReceiptModelExplainer' },
          ),
        { signal, source: 'ReceiptModelExplainer' },
      );
    } catch (error) {
      throw modelFailure(error, signal);
    }
  }
  private identity(context: ModelExplanationContext) {
    return {
      version: context.version,
      eventId: context.eventId,
      runId: context.runId,
      threadId: context.threadId,
      executionId: context.executionId,
    };
  }
  private live(signal: AbortSignal, deadlineAt: number): void {
    if (signal.aborted || !Number.isFinite(deadlineAt) || this.now() >= deadlineAt)
      throw new ModelExplanationFailure('cancelled');
  }
  private async execute(
    request: ModelExplanationRequest,
    context: ModelExplanationContext,
    signal: AbortSignal,
    deadlineAt: number,
  ) {
    this.live(signal, deadlineAt);
    const response = await this.transport.execute(
      request,
      context.checkpointGrant,
      signal,
      deadlineAt,
    );
    try {
      return parseModelExplanationResponse(response);
    } catch {
      throw new ModelExplanationFailure('rejected');
    }
  }
  private async reserve(
    model: string,
    purpose: 'privacy-probe' | 'explanation',
    maxOutputTokens: number,
    context: ModelExplanationContext,
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<ModelAttemptReservation> {
    const attemptKey = randomBytes(24).toString('base64url');
    const response = await this.execute(
      {
        ...this.identity(context),
        operation: 'reserve',
        attemptKey,
        purpose,
        model,
        route: settings.route,
        maxOutputTokens,
      },
      context,
      signal,
      deadlineAt,
    );
    if (
      response.operation !== 'reserve' ||
      response.reservation.attemptKey !== attemptKey ||
      response.reservation.model !== model ||
      response.reservation.purpose !== purpose ||
      response.reservation.route !== settings.route ||
      response.reservation.maxOutputTokens !== maxOutputTokens
    )
      throw new ModelExplanationFailure('rejected');
    return response.reservation;
  }
  private async outbound(
    model: string,
    prompt: string,
    maxOutputTokens: number,
    signal: AbortSignal,
    deadlineAt: number,
    purpose: 'privacy-probe' | 'explanation',
    evidenceAgeMs = 0,
  ): Promise<LanguageModelResult> {
    return modelAttemptSpan(model, purpose, evidenceAgeMs, () =>
      this.attempt(model, prompt, maxOutputTokens, signal, deadlineAt),
    );
  }
  private async attempt(
    model: string,
    prompt: string,
    maxOutputTokens: number,
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<LanguageModelResult> {
    this.live(signal, deadlineAt);
    const bounded = AbortSignal.any([
      signal,
      AbortSignal.timeout(Math.max(1, Math.ceil(deadlineAt - this.now()))),
    ]);
    try {
      const breaker = this.#breakers.get(`${settings.route}:${model}`);
      if (!breaker) throw new ModelExplanationFailure('policy');
      const result = await breaker.execute(
        async ({ signal: attempt }) => {
          try {
            return await this.#attempt.execute(
              ({ signal: timed }) =>
                this.model.generate(
                  {
                    model,
                    route: settings.route,
                    prompt,
                    maxOutputTokens,
                    zeroDataRetention: true,
                  },
                  timed,
                ),
              { signal: attempt, source: 'LanguageModel' },
            );
          } catch (error) {
            this.live(bounded, deadlineAt);
            // Local admission backpressure is not evidence of provider health.
            if (error instanceof OutboundRateLimitError) throw error;
            const failure = modelFailure(error, bounded);
            if (failure.kind === 'exhausted') breaker.trip();
            throw failure;
          }
        },
        { signal: bounded, source: 'LanguageModel' },
      );
      this.live(bounded, deadlineAt);
      if (
        !Number.isSafeInteger(result.outputTokens) ||
        result.outputTokens === undefined ||
        result.outputTokens <= 0 ||
        result.outputTokens > maxOutputTokens ||
        typeof result.text !== 'string' ||
        result.text.length > 2048
      )
        throw new ModelExplanationFailure('rejected');
      verifyGatewayAcknowledgement(result, model);
      return result;
    } catch (error) {
      throw modelFailure(error, bounded);
    }
  }
  private async generate(
    model: string,
    receipt: PriceToolReceipt,
    context: ModelExplanationContext,
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<ModelExplanation> {
    await this.reserve(model, 'privacy-probe', settings.probeTokens, context, signal, deadlineAt);
    await this.outbound(
      model,
      settings.probeText,
      settings.probeTokens,
      signal,
      deadlineAt,
      'privacy-probe',
    );
    const verifiedAt = this.now();
    const privacy: GatewayPrivacyEvidence = {
      id: randomBytes(24).toString('base64url'),
      model,
      route: settings.route,
      policy: 'gateway-zdr-routing-v1',
      verifiedAt,
      expiresAt: verifiedAt + settings.evidenceTtlMs,
    };
    assertGatewayPrivacy(privacy, model, this.now());
    const reservation = await this.reserve(
      model,
      'explanation',
      settings.explanationTokens,
      context,
      signal,
      deadlineAt,
    );
    assertGatewayPrivacy(privacy, model, this.now());
    // Only versioned instructions and facts from this receipt cross the provider boundary.
    const prompt = `${MODEL_EXPLANATION_PROMPT}\n${MODEL_EXPLANATION_GRAMMAR}\nReturn exactly the three following factual sentences, each once, in any order, separated by one space. Return no other text.\n${explanationFacts(receipt, context.locale).join('\n')}`;
    const result = await this.outbound(
      model,
      prompt,
      reservation.maxOutputTokens,
      signal,
      deadlineAt,
      'explanation',
      this.now() - privacy.verifiedAt,
    );
    if (!validExplanationText(result.text, receipt, context.locale))
      throw new ModelExplanationFailure('rejected');
    const explanation = parseModelExplanation({
      version: receipt.version,
      eventId: receipt.eventId,
      runId: receipt.runId,
      threadId: receipt.threadId,
      explanationId: reservation.reservationId,
      toolReceiptId: receipt.receiptId,
      reservationId: reservation.reservationId,
      authorship: 'model-written',
      promptVersion: MODEL_EXPLANATION_PROMPT,
      grammarVersion: MODEL_EXPLANATION_GRAMMAR,
      locale: context.locale,
      text: result.text,
      model,
      route: settings.route,
      privacyEvidenceId: privacy.id,
      outputTokens: result.outputTokens,
      acceptedAt: new Date(this.now()).toISOString(),
    });
    const accepted = await this.execute(
      { ...this.identity(context), operation: 'accept', explanation },
      context,
      signal,
      deadlineAt,
    );
    if (
      accepted.operation !== 'accept' ||
      !validModelExplanation(accepted.explanation, receipt, context.locale) ||
      !sameModelExplanation(accepted.explanation, explanation)
    )
      throw new ModelExplanationFailure('rejected');
    return accepted.explanation;
  }
}
