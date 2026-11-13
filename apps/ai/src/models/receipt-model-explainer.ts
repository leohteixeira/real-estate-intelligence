import { AiRetryAllowance, withinAiDeadline } from '../shared/ai-resilience';
import { randomBytes } from 'node:crypto';
import {
  BulkheadPolicy,
  CircuitBreakerPolicy,
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
import type {
  ModelExplainer,
  ModelExplanationContext,
  ModelExplanationTransport,
} from './model-explanation.port';
import { modelExplanationSettings as settings } from './model-explanation.settings';
import { modelFailure, recordModelFailure } from './model-failure';
import { modelAttemptSpan } from './model-telemetry';

/** A persistent token reservation precedes every outbound attempt to the provider. */
export class ReceiptModelExplainer implements ModelExplainer {
  readonly #bulkhead: BulkheadPolicy;
  readonly #breaker: CircuitBreakerPolicy;
  readonly #limiter: OutboundRateLimitPolicy;
  readonly #timeout: TimeoutPolicy;
  readonly #retry: AiRetryAllowance;
  readonly #physicalFailures = new WeakSet<object>();
  public constructor(
    private readonly model: LanguageModel,
    private readonly transport: ModelExplanationTransport,
    private readonly now: () => number = Date.now,
    random: () => number = Math.random,
  ) {
    this.#bulkhead = new BulkheadPolicy({ name: settings.policies.bulkhead, ...settings.bulkhead });
    this.#breaker = new CircuitBreakerPolicy({
      name: settings.policies.circuitBreaker,
      ...settings.breaker,
      recordIf: (error) =>
        error instanceof SlowModelAttempt ||
        (error instanceof ModelExplanationFailure &&
          recordModelFailure(error) &&
          this.#physicalFailures.has(error)),
    });
    this.#retry = new AiRetryAllowance(settings.retry, now, random);
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
    try {
      return await this.#bulkhead.execute(
        ({ signal: admitted }) => this.generate(receipt, context, admitted, deadlineAt),
        { signal, source: 'ReceiptModelExplainer' },
      );
    } catch (error) {
      const failure = modelFailure(error, signal);
      if (failure.kind !== 'transient') throw failure;
      // A lost acceptance response is ambiguous: the explanation may already be retained.
      const recovered = await this.execute(
        { ...this.identity(context), operation: 'get' },
        context,
        signal,
        deadlineAt,
      ).catch((recovery: unknown) => {
        throw modelFailure(recovery, signal);
      });
      if (recovered.operation !== 'get') throw new ModelExplanationFailure('rejected');
      if (!recovered.explanation) throw failure;
      if (!validModelExplanation(recovered.explanation, receipt, context.locale))
        throw new ModelExplanationFailure('rejected');
      return recovered.explanation;
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
        purpose: 'explanation',
        model: settings.model,
        route: settings.route,
        maxOutputTokens: settings.explanationTokens,
      },
      context,
      signal,
      deadlineAt,
    );
    if (
      response.operation !== 'reserve' ||
      response.reservation.attemptKey !== attemptKey ||
      response.reservation.model !== settings.model ||
      response.reservation.purpose !== 'explanation' ||
      response.reservation.route !== settings.route ||
      response.reservation.maxOutputTokens !== settings.explanationTokens
    )
      throw new ModelExplanationFailure('rejected');
    return response.reservation;
  }
  private async outbound(
    prompt: string,
    context: ModelExplanationContext,
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<{ result: LanguageModelResult; reservation: ModelAttemptReservation }> {
    this.#retry.recordCall();
    const retry = this.#retry.policy(
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
      return await this.#breaker.execute(
        async ({ signal: logical }) => {
          const started = this.now();
          const outcome = await ResiliencePolicy.wrap(retry, this.#limiter).execute(
            async ({ signal: admitted }) => {
              this.live(admitted, deadlineAt);
              const reservation = await this.reserve(context, admitted, deadlineAt);
              this.live(admitted, deadlineAt);
              const result = await modelAttemptSpan(settings.model, async () => {
                try {
                  return await this.#timeout.execute(
                    ({ signal: timed }) =>
                      this.model.generate(
                        {
                          model: settings.model,
                          route: settings.route,
                          prompt,
                          maxOutputTokens: settings.explanationTokens,
                        },
                        timed,
                      ),
                    { signal: admitted, source: 'LanguageModel' },
                  );
                } catch (error) {
                  this.live(admitted, deadlineAt);
                  const failure = modelFailure(error, admitted);
                  this.#physicalFailures.add(failure);
                  if (failure.kind === 'exhausted') this.#breaker.trip();
                  throw failure;
                }
              });
              this.live(admitted, deadlineAt);
              if (
                !Number.isSafeInteger(result.outputTokens) ||
                result.outputTokens === undefined ||
                result.outputTokens <= 0 ||
                result.outputTokens > settings.explanationTokens ||
                typeof result.text !== 'string' ||
                result.text.length > 2048 ||
                result.model !== settings.model ||
                result.route !== settings.route
              )
                throw new ModelExplanationFailure('rejected');
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
    receipt: PriceToolReceipt,
    context: ModelExplanationContext,
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<ModelExplanation> {
    // Only versioned instructions and facts from this receipt cross the provider boundary; the
    // visitor's question is never part of this request.
    const prompt = `${MODEL_EXPLANATION_PROMPT}\n${MODEL_EXPLANATION_GRAMMAR}\nReturn exactly the three following factual sentences, each once, in any order, separated by one space. Return no other text.\n${explanationFacts(receipt, context.locale).join('\n')}`;
    const { result, reservation } = await this.outbound(prompt, context, signal, deadlineAt);
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
      model: settings.model,
      route: settings.route,
      privacyEvidenceId: null,
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
