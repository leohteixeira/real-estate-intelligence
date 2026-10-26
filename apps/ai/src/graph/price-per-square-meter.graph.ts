import { END, START, StateGraph } from '@langchain/langgraph';
import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import {
  parsePriceToolReceipt,
  sameAskIdentity,
  sameAskInputs,
  type PriceToolReceipt,
} from '@rei/contracts';
import { z } from 'zod';
import {
  PriceToolFailure,
  type PricePerSquareMeterTool,
} from '../tools/price-per-square-meter.port';
import { priceNodeSpan } from './price-telemetry';
import type { DurablePriceInput } from './remote-checkpoint-saver';
export const PRICE_GRAPH = Symbol('PRICE_GRAPH');
export interface PriceAuthority {
  readonly executionId: string;
  readonly toolGrant: string;
  readonly signal: AbortSignal;
  readonly deadlineAt: number;
}
const PriceState = z.object({
  input: z.custom<DurablePriceInput>(),
  decision: z.boolean().optional(),
  visitedNodes: z.array(z.string()).optional(),
  receipt: z.custom<PriceToolReceipt>().optional(),
});
export function invokePriceTool(
  tool: PricePerSquareMeterTool,
  input: DurablePriceInput,
  authority: PriceAuthority,
): Promise<PriceToolReceipt> {
  return priceNodeSpan('tool', input, () => invokePriceToolAttempt(tool, input, authority));
}
async function invokePriceToolAttempt(
  tool: PricePerSquareMeterTool,
  input: DurablePriceInput,
  authority: PriceAuthority,
): Promise<PriceToolReceipt> {
  authority.signal.throwIfAborted();
  if (!input.inputs) throw new PriceToolFailure('rejected');
  const request = {
    version: 1 as const,
    eventId: input.eventId,
    runId: input.runId,
    threadId: input.threadId,
    executionId: authority.executionId,
    operation: 'price-per-square-meter' as const,
    inputs: input.inputs,
  };
  const receipt = parsePriceToolReceipt(
    await tool.calculate(request, authority.toolGrant, authority.signal, authority.deadlineAt),
  );
  if (
    !sameAskIdentity(receipt, request) ||
    receipt.executionId !== authority.executionId ||
    !sameAskInputs(receipt.inputs, input.inputs)
  )
    throw new PriceToolFailure('rejected');
  return receipt;
}
export function compilePriceGraph(
  tool: PricePerSquareMeterTool,
  authority: PriceAuthority,
  saver: BaseCheckpointSaver,
  interruptBefore?: ['priceTool'],
) {
  return new StateGraph(PriceState)
    .addNode('fixedDecision', (state) =>
      priceNodeSpan('fixedDecision', state.input, async () => {
        authority.signal.throwIfAborted();
        if (state.input.step !== 'structured-price-v1') throw new PriceToolFailure('rejected');
        return { decision: true, visitedNodes: [...(state.visitedNodes ?? []), 'fixedDecision'] };
      }),
    )
    .addNode('validatedInputs', (state) =>
      priceNodeSpan('validatedInputs', state.input, async () => {
        authority.signal.throwIfAborted();
        if (state.input.step !== 'text-price-v1') throw new PriceToolFailure('rejected');
        return { decision: true, visitedNodes: [...(state.visitedNodes ?? []), 'validatedInputs'] };
      }),
    )
    .addNode('priceTool', async (state) => {
      if (!state.decision) throw new PriceToolFailure('rejected');
      const receipt = await priceNodeSpan('priceTool', state.input, () =>
        invokePriceTool(tool, state.input, authority),
      );
      return { receipt, visitedNodes: [...(state.visitedNodes ?? []), 'priceTool'] };
    })
    .addConditionalEdges(START, (state) =>
      state.input.step === 'text-price-v1' ? 'validatedInputs' : 'fixedDecision',
    )
    .addEdge('fixedDecision', 'priceTool')
    .addEdge('validatedInputs', 'priceTool')
    .addEdge('priceTool', END)
    .compile({ checkpointer: saver, ...(interruptBefore ? { interruptBefore } : {}) });
}
export type PriceGraph = ReturnType<typeof compilePriceGraph>;
