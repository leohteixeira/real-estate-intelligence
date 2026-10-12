import type { PriceExecutionRequest } from '@rei/contracts';
import type { PricePerSquareMeterTool } from '../tools/price-per-square-meter.port';
import { compilePriceGraph, invokePriceTool } from './price-per-square-meter.graph';
import { durablePriceInput, RemoteCheckpointSaver } from './remote-checkpoint-saver';
import type { GraphCheckpointTransport } from './graph-checkpoint.port';
export class PriceGraphFactory {
  public constructor(
    private readonly tool: PricePerSquareMeterTool,
    private readonly checkpoints: GraphCheckpointTransport,
  ) {}
  public create(input: PriceExecutionRequest, signal: AbortSignal, deadlineAt: number) {
    const authority = {
      executionId: input.executionId,
      toolGrant: input.toolGrant,
      signal,
      deadlineAt,
    };
    const saver = new RemoteCheckpointSaver(input, this.checkpoints, signal, deadlineAt);
    const durable = durablePriceInput(input);
    return {
      saver,
      graph: compilePriceGraph(this.tool, authority, saver),
      input: durable,
      rebind: () => invokePriceTool(this.tool, durable, authority),
    };
  }
}
