import { Inject, Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import {
  parseRunExecutionEvidence,
  parsePriceToolReceipt,
  type PriceToolReceipt,
} from '@rei/contracts';
import type { RunExecutionEvidence, RunExecutionInput } from '@rei/domain';
import { NO_OP_GRAPH, type NoOpGraph } from '../graph/no-op.graph';
import { PRICE_GRAPH, type PriceGraph } from '../graph/price-per-square-meter.graph';

@Injectable()
export class ExecutionService {
  public constructor(
    @Inject(NO_OP_GRAPH) private readonly graph: NoOpGraph,
    @Optional() @Inject(PRICE_GRAPH) private readonly priceGraph?: PriceGraph,
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
    } catch {
      throw new ServiceUnavailableException('Execution unavailable.');
    } finally {
      if (abort) signal.removeEventListener('abort', abort);
    }
  }
  private async traverse(
    input: RunExecutionInput,
    signal: AbortSignal,
  ): Promise<RunExecutionEvidence> {
    if (input.step === 'structured-price-v1') {
      if (!this.priceGraph) throw new Error('Price execution unavailable.');
      const updates = await this.priceGraph.stream({ input }, { streamMode: 'updates', signal });
      const visitedNodes: string[] = [];
      let receipt: PriceToolReceipt | undefined;
      for await (const update of updates) {
        signal.throwIfAborted();
        visitedNodes.push(...Object.keys(update));
        if ('priceTool' in update && update.priceTool)
          receipt = parsePriceToolReceipt(update.priceTool.receipt);
      }
      signal.throwIfAborted();
      return parseRunExecutionEvidence({
        version: 1,
        eventId: input.eventId,
        runId: input.runId,
        threadId: input.threadId,
        step: input.step,
        outcome: 'price-calculated',
        executionId: input.executionId,
        visitedNodes,
        receipt,
      });
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
