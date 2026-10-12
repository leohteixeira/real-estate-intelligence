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

@Injectable()
export class ExecutionService {
  private readonly logger = new ConsoleLogger(ExecutionService.name, { colors: false });
  public constructor(
    @Inject(NO_OP_GRAPH) private readonly graph: NoOpGraph,
    @Optional() @Inject(PRICE_GRAPH) private readonly priceFactory?: PriceGraphFactory,
  ) {}
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
      return await Promise.race([this.traverse(input, signal), stopped]);
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'ask.execution.unavailable',
          category:
            error instanceof GraphCheckpointFailure || error instanceof PriceToolFailure
              ? error.kind
              : signal.aborted
                ? 'cancelled'
                : 'transient',
          source:
            error instanceof GraphCheckpointFailure
              ? error.source
              : error instanceof PriceToolFailure
                ? 'price-tool'
                : 'execution',
          ...(error instanceof GraphCheckpointFailure && error.operation
            ? { operation: error.operation }
            : {}),
        }),
      );
      if (
        (error instanceof GraphCheckpointFailure || error instanceof PriceToolFailure) &&
        error.kind === 'rejected'
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
    if (input.step === 'structured-price-v1' || input.step === 'text-price-v1') {
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
}
