import type { RoutedPriceExecutionInput } from '@rei/contracts';
import { compileIntentRoutingGraph, decisionRequest } from './intent-routing.graph';
import type { IntentDecider } from '../models/intent-decider';
import type { IntentDecisionTransport } from '../models/intent-decision.transport';
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
    private readonly decider?: IntentDecider,
    private readonly decisions?: IntentDecisionTransport,
  ) {}
  public create(
    input: Exclude<PriceExecutionRequest, RoutedPriceExecutionInput>,
    signal: AbortSignal,
    deadlineAt: number,
  ) {
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
  public createRouted(input: RoutedPriceExecutionInput, signal: AbortSignal, deadlineAt: number) {
    if (!this.decider || !this.decisions) throw new ModelExplanationFailure('policy');
    const authority = {
      executionId: input.executionId,
      toolGrant: input.toolGrant,
      checkpointGrant: input.checkpointGrant,
      signal,
      deadlineAt,
    };
    const saver = new RemoteCheckpointSaver(input, this.checkpoints, signal, deadlineAt);
    const durable = durablePriceInput(input);
    const decisions = this.decisions;
    return {
      saver,
      input: durable,
      graph: compileIntentRoutingGraph(
        this.tool,
        this.decider,
        decisions,
        authority,
        saver,
        this.model,
        input.step === 'routed-text-explanation-v1',
      ),
      canResume: async () => {
        const found = await decisions.execute(
          { ...decisionRequest(durable, input.executionId), operation: 'get' },
          input.checkpointGrant,
          signal,
          deadlineAt,
        );
        if (found.operation !== 'get' || !found.decision)
          throw new ModelExplanationFailure('rejected');
        return found.confirmation !== null;
      },
      rebind: async () => {
        const found = await decisions.execute(
          { ...decisionRequest(durable, input.executionId), operation: 'get' },
          input.checkpointGrant,
          signal,
          deadlineAt,
        );
        if (
          found.operation !== 'get' ||
          !found.decision ||
          found.decision.intent !== 'price_per_square_meter' ||
          (found.decision.probability < 0.85 && !found.confirmation)
        )
          throw new ModelExplanationFailure('rejected');
        const inputs = found.confirmation ? found.confirmation.inputs : input.inputs;
        if (!inputs) throw new ModelExplanationFailure('rejected');
        return invokePriceTool(this.tool, { ...durable, inputs }, authority);
      },
    };
  }
}
