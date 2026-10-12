import { END, START, StateGraph } from '@langchain/langgraph';
import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import { z } from 'zod';
import {
  sameAskIdentity,
  sameAskInputs,
  type ModelExplanation,
  type PriceToolReceipt,
} from '@rei/contracts';
import type { ModelExplainer } from '../models/model-explanation.port';
import { ModelExplanationFailure } from '../models/language-model.port';
import type { PricePerSquareMeterTool } from '../tools/price-per-square-meter.port';
import { invokePriceTool, type PriceAuthority } from './price-per-square-meter.graph';
import { priceNodeSpan } from './price-telemetry';
import type { DurablePriceInput } from './remote-checkpoint-saver';

const ExplainedState = z.object({
  input: z.custom<DurablePriceInput>(),
  decision: z.boolean().optional(),
  visitedNodes: z.array(z.string()).optional(),
  receipt: z.custom<PriceToolReceipt>().optional(),
  explanation: z.custom<ModelExplanation>().optional(),
});
/** Separate versioned graph; historical price-v1 node order and checkpoint shape stay intact. */
export function compileExplainedPriceGraph(
  tool: PricePerSquareMeterTool,
  model: ModelExplainer,
  authority: PriceAuthority & { readonly checkpointGrant: string },
  saver: BaseCheckpointSaver,
  interruptBefore?: ['modelExplanation'],
) {
  return new StateGraph(ExplainedState)
    .addNode('validatedInputs', (state) =>
      priceNodeSpan('validatedInputs', state.input, async () => {
        authority.signal.throwIfAborted();
        if (state.input.step !== 'text-price-explanation-v1')
          throw new ModelExplanationFailure('rejected');
        return { decision: true, visitedNodes: [...(state.visitedNodes ?? []), 'validatedInputs'] };
      }),
    )
    .addNode('priceTool', async (state) => {
      if (!state.decision) throw new ModelExplanationFailure('rejected');
      return {
        receipt: await priceNodeSpan('priceTool', state.input, () =>
          invokePriceTool(tool, state.input, authority),
        ),
        visitedNodes: [...(state.visitedNodes ?? []), 'priceTool'],
      };
    })
    .addNode('modelExplanation', (state) =>
      priceNodeSpan('modelExplanation', state.input, async () => {
        if (state.input.step !== 'text-price-explanation-v1' || !state.receipt)
          throw new ModelExplanationFailure('rejected');
        let receipt = state.receipt;
        if (receipt.executionId !== authority.executionId) {
          const rebound = await invokePriceTool(tool, state.input, authority);
          if (
            !sameAskIdentity(receipt, rebound) ||
            receipt.receiptId !== rebound.receiptId ||
            !sameAskInputs(receipt.inputs, rebound.inputs) ||
            receipt.result.minorUnits !== rebound.result.minorUnits ||
            receipt.result.computedAt !== rebound.result.computedAt
          )
            throw new ModelExplanationFailure('rejected');
          receipt = rebound;
        }
        const explanation = await model.explain(
          receipt,
          {
            version: state.input.version,
            eventId: state.input.eventId,
            runId: state.input.runId,
            threadId: state.input.threadId,
            executionId: authority.executionId,
            checkpointGrant: authority.checkpointGrant,
            locale: state.input.locale,
          },
          authority.signal,
          authority.deadlineAt,
        );
        return {
          receipt,
          explanation,
          visitedNodes: [...(state.visitedNodes ?? []), 'modelExplanation'],
        };
      }),
    )
    .addEdge(START, 'validatedInputs')
    .addEdge('validatedInputs', 'priceTool')
    .addEdge('priceTool', 'modelExplanation')
    .addEdge('modelExplanation', END)
    .compile({ checkpointer: saver, ...(interruptBefore ? { interruptBefore } : {}) });
}
