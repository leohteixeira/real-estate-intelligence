import { AiRetryAllowance, withinAiDeadline } from '../shared/ai-resilience';
import { randomBytes } from 'node:crypto';
import {
  BulkheadPolicy,
  CircuitBreakerPolicy,
  FallbackPolicy,
  OutboundRateLimitPolicy,
  ResiliencePolicy,
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
  readonly #limiter: OutboundRateLimitPolicy;
  readonly #timeout: TimeoutPolicy;
  readonly #retry: ReadonlyMap<string, AiRetryAllowance>;
  readonly #physicalFailures = new WeakSet<object>();
  public constructor(
    private readonly model: LanguageModel,
    private readonly transport: ModelExplanationTransport,
    private readonly now: () => number = Date.now,
    random: () => number = Math.random,
  ) {
    this.#bulkhead = new BulkheadPolicy({ name: settings.policies.bulkhead, ...settings.bulkhead });
    this.#breakers = new Map(
      [settings.primary, settings.secondary].map((model) => [
        `${settings.route}:${model}`,
        new CircuitBreakerPolicy({
          name: `${settings.policies.circuitBreaker}.${settings.route}.${model}`,
          ...settings.breaker,
          recordIf: (error) =>
            error instanceof SlowModelAttempt ||
            (error instanceof ModelExplanationFailure &&
              recordModelFailure(error) &&
              this.#physicalFailures.has(error)),
        }),
      ]),
    );
    this.#retry = new Map(
      [settings.primary, settings.secondary].map((model) => [
        model,
        new AiRetryAllowance(settings.retry, now, random),
      ]),
    );
    this.#limiter = new OutboundRateLimitPolicy({
      name: settings.policies.rateLimit,
      ...settings.rateLimit,
    });
    this.#timeout = new TimeoutPolicy({
      name: settings.policies.timeout,
      timeout: settings.timeoutMs,
    });
  }
  public async explain(
    receipt: PriceToolReceipt,
    context: ModelExplanationContext,
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<ModelExplanation> {
    return withinAiDeadline(
      signal,
      deadlineAt,
      this.now,
      () => new ModelExplanationFailure('cancelled'),
      (bounded) => this.explainWithinDeadline(receipt, context, bounded, deadlineAt),
    );
  }
  private async explainWithinDeadline(
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
    this.live(signal, deadlineAt);
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
    context: ModelExplanationContext,
    signal: AbortSignal,
    deadlineAt: number,
    purpose: 'privacy-probe' | 'explanation',
    privacy?: GatewayPrivacyEvidence,
  ): Promise<{ result: LanguageModelResult; reservation: ModelAttemptReservation }> {
    const breaker = this.#breakers.get(`${settings.route}:${model}`);
    const allowance = this.#retry.get(model);
    if (!breaker || !allowance) throw new ModelExplanationFailure('policy');
    allowance.recordCall();
    const retry = allowance.policy(
      settings.policies.retry,
      signal,
      deadlineAt,
      settings.timeoutMs,
      (error) =>
        error instanceof ModelExplanationFailure &&
        error.kind === 'transient' &&
        this.#physicalFailures.has(error),
      (error) => (error instanceof ModelExplanationFailure ? error.retryAfterMs : undefined),
    );
    try {
      return await breaker.execute(
        async ({ signal: logical }) => {
          const started = this.now();
          const outcome = await ResiliencePolicy.wrap(retry, this.#limiter).execute(
            async ({ signal: admitted }) => {
              this.live(admitted, deadlineAt);
              if (privacy) assertGatewayPrivacy(privacy, model, this.now());
              const reservation = await this.reserve(
                model,
                purpose,
                maxOutputTokens,
                context,
                admitted,
                deadlineAt,
              );
              this.live(admitted, deadlineAt);
              if (privacy) assertGatewayPrivacy(privacy, model, this.now());
              const result = await modelAttemptSpan(
                model,
                purpose,
                privacy ? this.now() - privacy.verifiedAt : 0,
                async () => {
                  try {
                    return await this.#timeout.execute(
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
                      { signal: admitted, source: 'LanguageModel' },
                    );
                  } catch (error) {
                    this.live(admitted, deadlineAt);
                    const failure = modelFailure(error, admitted);
                    this.#physicalFailures.add(failure);
                    if (failure.kind === 'exhausted') breaker.trip();
                    throw failure;
                  }
                },
              );
              this.live(admitted, deadlineAt);
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
              return { result, reservation };
            },
            { signal: logical, source: 'LanguageModel' },
          );
          this.live(logical, deadlineAt);
          if (this.now() - started >= settings.slowCallThresholdMs)
            throw new SlowModelAttempt(outcome);
          return outcome;
        },
        { signal, source: 'LanguageModel' },
      );
    } catch (error) {
      this.live(signal, deadlineAt);
      if (error instanceof SlowModelAttempt) return error.outcome;
      throw modelFailure(error, signal);
    }
  }
  private async generate(
    model: string,
    receipt: PriceToolReceipt,
    context: ModelExplanationContext,
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<ModelExplanation> {
    await this.outbound(
      model,
      settings.probeText,
      settings.probeTokens,
      context,
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
    // Only versioned instructions and facts from this receipt cross the provider boundary.
    const prompt = `${MODEL_EXPLANATION_PROMPT}\n${MODEL_EXPLANATION_GRAMMAR}\nReturn exactly the three following factual sentences, each once, in any order, separated by one space. Return no other text.\n${explanationFacts(receipt, context.locale).join('\n')}`;
    const { result, reservation } = await this.outbound(
      model,
      prompt,
      settings.explanationTokens,
      context,
      signal,
      deadlineAt,
      'explanation',
      privacy,
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

class SlowModelAttempt extends Error {
  public constructor(
    public readonly outcome: { result: LanguageModelResult; reservation: ModelAttemptReservation },
  ) {
    super('Slow model attempt.');
  }
}
