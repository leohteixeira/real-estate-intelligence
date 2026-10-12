import type { PriceExecutionRequest } from '@rei/contracts';
import type { PricePerSquareMeterTool } from '../tools/price-per-square-meter.port';
import { compilePriceGraph, invokePriceTool } from './price-per-square-meter.graph';
import { durablePriceInput, RemoteCheckpointSaver } from './remote-checkpoint-saver';
import type { GraphCheckpointTransport } from './graph-checkpoint.port';
import { compileExplainedPriceGraph } from './explained-price.graph';
import type { ModelExplainer } from '../models/model-explanation.port';
import { ModelExplanationFailure } from '../models/language-model.port';
export class PriceGraphFactory {
  public constructor(
    private readonly tool: PricePerSquareMeterTool,
    private readonly checkpoints: GraphCheckpointTransport,
    private readonly model?: ModelExplainer,
  ) {}
  public create(input: PriceExecutionRequest, signal: AbortSignal, deadlineAt: number) {
    const authority = {
      executionId: input.executionId,
      toolGrant: input.toolGrant,
      checkpointGrant: input.checkpointGrant,
      signal,
      deadlineAt,
    };
    const saver = new RemoteCheckpointSaver(input, this.checkpoints, signal, deadlineAt);
    const durable = durablePriceInput(input);
    return {
      saver,
      graph:
        input.step === 'text-price-explanation-v1'
          ? compileExplainedPriceGraph(
              this.tool,
              this.model ?? {
                explain: () => Promise.reject(new ModelExplanationFailure('policy')),
              },
              authority,
              saver,
            )
          : compilePriceGraph(this.tool, authority, saver),
      input: durable,
      rebind: () => invokePriceTool(this.tool, durable, authority),
    };
  }
}
