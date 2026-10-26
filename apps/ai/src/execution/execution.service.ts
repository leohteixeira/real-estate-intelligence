import { trace } from '@opentelemetry/api';
import { priceNodeSpan } from '../graph/price-telemetry';
import { Command } from '@langchain/langgraph';
import type { RoutedPriceExecutionInput } from '@rei/domain';
import {
  BadRequestException,
  Inject,
  Injectable,
  ConsoleLogger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  parseRunExecutionEvidence,
  parsePriceToolReceipt,
  sameAskIdentity,
  sameAskInputs,
} from '@rei/contracts';
import type { RunExecutionEvidence, RunExecutionInput } from '@rei/domain';
import { NO_OP_GRAPH, type NoOpGraph } from '../graph/no-op.graph';
import { PRICE_GRAPH } from '../graph/price-per-square-meter.graph';
import { PriceGraphFactory } from '../graph/price-graph.factory';
import { GraphCheckpointFailure } from '../graph/graph-checkpoint.port';
import { PriceToolFailure } from '../tools/price-per-square-meter.port';
import { readConfig } from '../config';
import { ModelExplanationFailure } from '../models/language-model.port';

@Injectable()
export class ExecutionService {
  private readonly logger = new ConsoleLogger(ExecutionService.name, { colors: false });
  public constructor(
    @Inject(NO_OP_GRAPH) private readonly graph: NoOpGraph,
    @Optional() @Inject(PRICE_GRAPH) private readonly priceFactory?: PriceGraphFactory,
  ) {}
  public execute(
    input: Exclude<RunExecutionInput, { step: 'routed-text-v1' | 'routed-text-explanation-v1' }>,
    signal: AbortSignal,
  ): Promise<
    Exclude<RunExecutionEvidence, { step: 'routed-text-v1' | 'routed-text-explanation-v1' }>
  >;
  public execute(input: RunExecutionInput, signal: AbortSignal): Promise<RunExecutionEvidence>;
  public async execute(
    input: RunExecutionInput,
    signal: AbortSignal,
  ): Promise<RunExecutionEvidence> {
    let abort: (() => void) | undefined;
    try {
      signal.throwIfAborted();
      const stopped = new Promise<never>((_resolve, reject) => {
        abort = () => reject(new Error());
        signal.addEventListener('abort', abort, { once: true });
      });
      return await (input.step === 'foundation'
        ? Promise.race([this.traverse(input, signal), stopped])
        : priceNodeSpan('run', input, async () => {
            const span = trace.getActiveSpan();
            if (input.step === 'routed-text-explanation-v1')
              span?.setAttribute('rei.ask.queue_duration_ms', input.queueDurationMs);
            try {
              const result = await Promise.race([this.traverse(input, signal), stopped]);
              if ('outcome' in result) span?.setAttribute('rei.ask.outcome', result.outcome);
              return result;
            } finally {
              if (input.step === 'routed-text-explanation-v1')
                span?.setAttribute(
                  'rei.ask.total_duration_ms',
                  Math.max(0, Date.now() - Date.parse(input.admittedAt)),
                );
            }
          }));
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'ask.execution.unavailable',
          category:
            error instanceof GraphCheckpointFailure ||
            error instanceof PriceToolFailure ||
            error instanceof ModelExplanationFailure
              ? error.kind
              : signal.aborted
                ? 'cancelled'
                : 'transient',
          source:
            error instanceof GraphCheckpointFailure
              ? error.source
              : error instanceof PriceToolFailure
                ? 'price-tool'
                : error instanceof ModelExplanationFailure
                  ? 'model-explanation'
                  : 'execution',
          ...(error instanceof GraphCheckpointFailure && error.operation
            ? { operation: error.operation }
            : {}),
        }),
      );
      if (
        ((error instanceof GraphCheckpointFailure || error instanceof PriceToolFailure) &&
          error.kind === 'rejected') ||
        (error instanceof ModelExplanationFailure &&
          ['policy', 'rejected', 'authentication', 'budget'].includes(error.kind))
      )
        throw new BadRequestException('Execution unavailable.');
      throw new ServiceUnavailableException('Execution unavailable.');
    } finally {
      if (abort) signal.removeEventListener('abort', abort);
    }
  }
  private async traverse(
    input: RunExecutionInput,
    signal: AbortSignal,
  ): Promise<RunExecutionEvidence> {
    if (input.step === 'routed-text-v1' || input.step === 'routed-text-explanation-v1')
      return this.traverseRouted(input, signal);
    if (input.step !== 'foundation') {
      if (!this.priceFactory) throw new GraphCheckpointFailure('rejected');
      const invocation = this.priceFactory.create(
        input,
        signal,
        Date.now() + (readConfig(process.env).tracerDeadlineMs ?? 4500),
      );
      const config = {
        configurable: { thread_id: input.threadId },
        signal,
        durability: 'sync' as const,
        streamMode: 'updates' as const,
      };
      const saved = await invocation.saver.getTuple(config);
      if (saved) invocation.saver.assertTuple(saved);
      let completed = false;
      if (saved) {
        const prior = await invocation.graph.getState(config);
        completed = prior.next.length === 0 && saved.pendingWrites?.length === 0;
      }
      if (!completed) {
        const updates = await invocation.graph.stream(
          saved ? null : { input: invocation.input },
          config,
        );
        for await (const update of updates) {
          signal.throwIfAborted();
          void update;
        }
      }
      const final = await invocation.graph.getState(config);
      signal.throwIfAborted();
      invocation.saver.assertCanonical(final.values.input);
      let receipt;
      try {
        receipt = parsePriceToolReceipt(final.values.receipt);
      } catch {
        throw new PriceToolFailure('rejected');
      }
      if (completed || receipt.executionId !== input.executionId) {
        const rebound = await invocation.rebind();
        if (
          !sameAskIdentity(receipt, rebound) ||
          receipt.receiptId !== rebound.receiptId ||
          receipt.operation !== rebound.operation ||
          receipt.provenance !== rebound.provenance ||
          !sameAskInputs(receipt.inputs, rebound.inputs) ||
          receipt.result.kind !== rebound.result.kind ||
          receipt.result.minorUnits !== rebound.result.minorUnits ||
          receipt.result.computedAt !== rebound.result.computedAt ||
          receipt.result.currency !== rebound.result.currency ||
          receipt.result.areaUnit !== rebound.result.areaUnit ||
          !sameAskInputs(receipt.result.inputs, rebound.result.inputs)
        )
          throw new PriceToolFailure('rejected');
        receipt = rebound;
      }
      try {
        return parseRunExecutionEvidence({
          version: 1,
          eventId: input.eventId,
          runId: input.runId,
          threadId: input.threadId,
          step: input.step,
          outcome: 'price-calculated',
          executionId: input.executionId,
          visitedNodes: final.values.visitedNodes,
          receipt,
          ...(input.step === 'text-price-explanation-v1'
            ? { explanation: 'explanation' in final.values ? final.values.explanation : undefined }
            : {}),
        });
      } catch {
        throw new PriceToolFailure('rejected');
      }
    }
    const updates = await this.graph.stream({}, { streamMode: 'updates', signal });
    const visitedNodes: string[] = [];
    for await (const update of updates) {
      signal.throwIfAborted();
      visitedNodes.push(...Object.keys(update));
    }
    signal.throwIfAborted();
    return parseRunExecutionEvidence({
      version: 1,
      runId: input.runId,
      threadId: input.threadId,
      step: input.step,
      outcome: 'foundation-executed',
      visitedNodes,
    });
  }
  private async traverseRouted(
    input: RoutedPriceExecutionInput,
    signal: AbortSignal,
  ): Promise<RunExecutionEvidence> {
    if (!this.priceFactory) throw new GraphCheckpointFailure('rejected');
    const invocation = this.priceFactory.createRouted(
      input,
      signal,
      Date.now() + (readConfig(process.env).tracerDeadlineMs ?? 4500),
    );
    const config = {
      configurable: { thread_id: input.threadId },
      signal,
      durability: 'sync' as const,
      streamMode: 'updates' as const,
    };
    const saved = await invocation.saver.getTuple(config);
    if (saved) invocation.saver.assertTuple(saved);
    const prior = saved ? await invocation.graph.getState(config) : null;
    const completed = prior?.next.length === 0 && saved?.pendingWrites?.length === 0;
    if (!completed) {
      const interrupted = prior?.tasks.some((task) => task.interrupts?.length);
      // A saved interrupt can precede dispatch's pause commit after a crash. Keep it
      // stopped until the API has retained confirmation; resume data is no authority.
      if (!interrupted || (await invocation.canResume())) {
        const updates = await invocation.graph.stream(
          saved
            ? interrupted
              ? new Command<boolean, never, never>({ resume: true })
              : null
            : { input: invocation.input },
          config,
        );
        for await (const update of updates) {
          signal.throwIfAborted();
          void update;
        }
      }
    }
    const final = await invocation.graph.getState(config);
    signal.throwIfAborted();
    invocation.saver.assertCanonical(final.values.input);
    const decision = final.values.decision;
    if (!decision) throw new ModelExplanationFailure('rejected');
    const identity = {
      version: 1,
      eventId: input.eventId,
      runId: input.runId,
      threadId: input.threadId,
      step: input.step,
      executionId: input.executionId,
      decisionReceiptId: decision.receiptId,
    };
    if (final.next.length)
      return parseRunExecutionEvidence({ ...identity, outcome: 'awaiting-confirmation' });
    if (final.values.outcome === 'execution-unavailable')
      return parseRunExecutionEvidence({ ...identity, outcome: 'execution-unavailable' });
    let receipt = parsePriceToolReceipt(final.values.receipt);
    if (completed || receipt.executionId !== input.executionId) {
      const rebound = await invocation.rebind();
      if (
        receipt.receiptId !== rebound.receiptId ||
        receipt.result.minorUnits !== rebound.result.minorUnits ||
        receipt.result.computedAt !== rebound.result.computedAt ||
        !sameAskInputs(receipt.inputs, rebound.inputs)
      )
        throw new PriceToolFailure('rejected');
      receipt = rebound;
    }
    return parseRunExecutionEvidence({
      ...identity,
      outcome: 'price-calculated',
      receipt,
      ...(input.step === 'routed-text-explanation-v1'
        ? { explanation: final.values.explanation }
        : {}),
    });
  }
}
