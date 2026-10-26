import { END, START, StateGraph, interrupt } from '@langchain/langgraph';
import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import { z } from 'zod';
import {
  parseIntentDecision,
  type IntentDecisionReceipt,
  type PriceToolReceipt,
  type IntentDecisionRequest,
} from '@rei/contracts';
import type { IntentDecider } from '../models/intent-decider';
import type { IntentDecisionTransport } from '../models/intent-decision.transport';
import { ModelExplanationFailure } from '../models/language-model.port';
import type { PricePerSquareMeterTool } from '../tools/price-per-square-meter.port';
import { invokePriceTool, type PriceAuthority } from './price-per-square-meter.graph';
import { priceNodeSpan } from './price-telemetry';
import type { DurablePriceInput } from './remote-checkpoint-saver';
const RoutingState = z.object({
  input: z.custom<DurablePriceInput>(),
  decision: z.custom<IntentDecisionReceipt>().optional(),
  receipt: z.custom<PriceToolReceipt>().optional(),
  outcome: z.enum(['price-calculated', 'execution-unavailable']).optional(),
});
export function decisionRequest(
  input: DurablePriceInput,
  executionId: string,
): Omit<Extract<IntentDecisionRequest, { operation: 'get' }>, 'operation'> {
  return {
    version: 1,
    eventId: input.eventId,
    runId: input.runId,
    threadId: input.threadId,
    executionId,
  };
}
export function compileIntentRoutingGraph(
  tool: PricePerSquareMeterTool,
  decider: IntentDecider,
  receipts: IntentDecisionTransport,
  authority: PriceAuthority & { readonly checkpointGrant: string },
  saver: BaseCheckpointSaver,
) {
  const read = async (input: DurablePriceInput) => {
    const found = await receipts.execute(
      { ...decisionRequest(input, authority.executionId), operation: 'get' },
      authority.checkpointGrant,
      authority.signal,
      authority.deadlineAt,
    );
    if (found.operation !== 'get') throw new ModelExplanationFailure('rejected');
    return found;
  };
  return new StateGraph(RoutingState)
    .addNode('typedDecision', (state) =>
      priceNodeSpan('typedDecision', state.input, async () => {
        authority.signal.throwIfAborted();
        const found = await read(state.input);
        if (found.decision) return { decision: found.decision };
        const reservation = await receipts.execute(
          {
            ...decisionRequest(state.input, authority.executionId),
            operation: 'reserve',
            attemptKey: authority.executionId,
          },
          authority.checkpointGrant,
          authority.signal,
          authority.deadlineAt,
        );
        if (reservation.operation !== 'reserve') throw new ModelExplanationFailure('rejected');
        const proposed = await decider.decide(
          state.input.query,
          state.input.locale,
          authority.signal,
          authority.deadlineAt,
        );
        let decision: ReturnType<typeof parseIntentDecision>;
        try {
          decision = parseIntentDecision(proposed);
        } catch {
          throw new ModelExplanationFailure('rejected');
        }
        authority.signal.throwIfAborted();
        const accepted = await receipts.execute(
          {
            ...decisionRequest(state.input, authority.executionId),
            operation: 'accept',
            reservationId: reservation.reservationId,
            decision,
          },
          authority.checkpointGrant,
          authority.signal,
          authority.deadlineAt,
        );
        if (accepted.operation !== 'accept') throw new ModelExplanationFailure('rejected');
        return { decision: accepted.decision };
      }),
    )
    .addNode('confidenceGate', async (state) => {
      authority.signal.throwIfAborted();
      const found = await read(state.input);
      if (!state.decision || found.decision?.receiptId !== state.decision.receiptId)
        throw new ModelExplanationFailure('rejected');
      if (found.decision.probability < 0.85 && !found.confirmation)
        interrupt('confirmation-required');
      // Resume data is never execution authority; only the API-retained confirmation is.
      return { decision: found.decision };
    })
    .addNode('executeIntent', (state) =>
      priceNodeSpan('executeIntent', state.input, async () => {
        const found = await read(state.input);
        if (
          !state.decision ||
          found.decision?.receiptId !== state.decision.receiptId ||
          (found.decision.probability < 0.85 && !found.confirmation)
        )
          throw new ModelExplanationFailure('rejected');
        const inputs = found.confirmation ? found.confirmation.inputs : state.input.inputs;
        if (found.decision.intent !== 'price_per_square_meter' || !inputs)
          return { outcome: 'execution-unavailable' as const };
        const receipt = await invokePriceTool(tool, { ...state.input, inputs }, authority);
        return { receipt, outcome: 'price-calculated' as const };
      }),
    )
    .addEdge(START, 'typedDecision')
    .addEdge('typedDecision', 'confidenceGate')
    .addEdge('confidenceGate', 'executeIntent')
    .addEdge('executeIntent', END)
    .compile({ checkpointer: saver });
}
