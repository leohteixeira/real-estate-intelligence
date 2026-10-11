import { END, START, StateGraph } from '@langchain/langgraph';
import {
  parseStructuredExecutionRequest,
  type PriceToolReceipt,
  type StructuredExecutionRequest,
} from '@rei/contracts';
import { z } from 'zod';
import type { PricePerSquareMeterTool } from '../tools/price-per-square-meter.port';
import { priceNodeSpan } from './price-telemetry';
export const PRICE_GRAPH = Symbol('PRICE_GRAPH');
const PriceState = z.object({
  input: z.custom<StructuredExecutionRequest>(),
  decision: z.boolean().optional(),
  receipt: z.custom<PriceToolReceipt>().optional(),
});
export function compilePriceGraph(tool: PricePerSquareMeterTool) {
  return new StateGraph(PriceState)
    .addNode('fixedDecision', (state) =>
      priceNodeSpan('fixedDecision', state.input, async () => {
        parseStructuredExecutionRequest(state.input);
        return { decision: true };
      }),
    )
    .addNode('priceTool', async (state, config) => {
      if (!state.decision) throw new Error('Price execution unavailable.');
      const input = state.input;
      const receipt = await priceNodeSpan('priceTool', input, () =>
        tool.calculate(
          {
            version: 1,
            eventId: input.eventId,
            runId: input.runId,
            threadId: input.threadId,
            executionId: input.executionId,
            operation: 'price-per-square-meter',
            inputs: input.inputs,
          },
          input.toolGrant,
          config?.signal ?? new AbortController().signal,
          Date.now() + 3500,
        ),
      );
      return { receipt };
    })
    .addEdge(START, 'fixedDecision')
    .addEdge('fixedDecision', 'priceTool')
    .addEdge('priceTool', END)
    .compile();
}
export type PriceGraph = ReturnType<typeof compilePriceGraph>;
