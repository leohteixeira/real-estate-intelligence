import { describe, expect, it, vi } from 'vitest';
import { parseExplainedExecutionRequest, type PriceToolRequest } from '@rei/contracts';
import { PriceGraphFactory } from './price-graph.factory';
import { checkpointFixture } from './checkpoint-test.fixture';
import { compileExplainedPriceGraph } from './explained-price.graph';
import { durablePriceInput, RemoteCheckpointSaver } from './remote-checkpoint-saver';
import { compileNoOpGraph } from './no-op.graph';
import { ExecutionService } from '../execution/execution.service';
import { ReceiptModelExplainer } from '../models/receipt-model-explainer';
import { acknowledged, modelReceipt, modelTransportFixture } from '../models/model-test.fixture';
import type { LanguageModelRequest } from '../models/language-model.port';
import { ModelExplanationFailure } from '../models/language-model.port';
import { explanationFacts } from '@rei/domain';
const input = parseExplainedExecutionRequest({
  version: 1,
  eventId: modelReceipt.eventId,
  runId: modelReceipt.runId,
  threadId: modelReceipt.threadId,
  executionId: modelReceipt.executionId,
  step: 'text-price-explanation-v1',
  query: 'Private question is deliberately absent from model prompt.',
  locale: 'en',
  toolGrant: 'g'.repeat(43),
  checkpointGrant: 'c'.repeat(43),
  inputs: modelReceipt.inputs,
});
describe('price-explanation-v1 durable graph', () => {
  it.each(['pause', 'lost-acceptance', 'lost-checkpoint', 'lost-terminal'] as const)(
    'recovers %s with stable model artifact and fresh tool authority',
    async (mode) => {
      const checkpoints = checkpointFixture(),
        transport = modelTransportFixture();
      let failAccepted = mode === 'lost-acceptance',
        failCheckpoint = mode === 'lost-checkpoint';
      const generate = vi.fn(async (request: LanguageModelRequest) =>
        acknowledged(
          request.model,
          request.prompt.includes('price-explanation-prompt-v1')
            ? explanationFacts(modelReceipt, 'en').join(' ')
            : 'ready',
        ),
      );
      const model = new ReceiptModelExplainer(
        { generate },
        {
          async execute(request, ...args) {
            const response = await transport.execute(request, ...args);
            if (request.operation === 'accept' && failAccepted) {
              failAccepted = false;
              throw new ModelExplanationFailure('transient');
            }
            return response;
          },
        },
      );
      const calculate = vi.fn(async (request: PriceToolRequest) => ({
        ...modelReceipt,
        executionId: request.executionId,
      }));
      const remote = {
        async execute(
          request: Parameters<typeof checkpoints.execute>[0],
          ...args: [string, AbortSignal, number]
        ) {
          if (failCheckpoint && transport.accepted && request.operation === 'put') {
            failCheckpoint = false;
            throw new Error('Lost saver acknowledgement.');
          }
          return checkpoints.execute(request, ...args);
        },
      };
      const signal = new AbortController().signal,
        deadlineAt = Date.now() + 10000;
      const service = new ExecutionService(
        compileNoOpGraph(),
        new PriceGraphFactory({ calculate }, remote, model),
      );
      if (mode === 'pause') {
        const saver = new RemoteCheckpointSaver(input, remote, signal, deadlineAt);
        const graph = compileExplainedPriceGraph(
          { calculate },
          model,
          {
            executionId: input.executionId,
            toolGrant: input.toolGrant,
            checkpointGrant: input.checkpointGrant,
            signal,
            deadlineAt,
          },
          saver,
          ['modelExplanation'],
        );
        await graph.invoke(
          { input: durablePriceInput(input) },
          { configurable: { thread_id: input.threadId }, durability: 'sync' },
        );
        expect(generate).not.toHaveBeenCalled();
        expect(
          (await graph.getState({ configurable: { thread_id: input.threadId } })).next,
        ).toEqual(['modelExplanation']);
      } else if (mode === 'lost-checkpoint')
        await expect(service.execute(input, signal)).rejects.toThrow();
      else await service.execute(input, signal);
      const saved = transport.accepted;
      const evidence = await service.execute(
        {
          ...input,
          executionId: input.eventId,
          toolGrant: 'n'.repeat(43),
          checkpointGrant: 'r'.repeat(43),
        },
        signal,
      );
      if (evidence.step !== 'text-price-explanation-v1')
        throw new Error('Explained evidence required.');
      expect(evidence.visitedNodes).toEqual(['validatedInputs', 'priceTool', 'modelExplanation']);
      expect(evidence.receipt.executionId).toBe(input.eventId);
      expect(evidence.receipt.receiptId).toBe(modelReceipt.receiptId);
      if (saved) expect(evidence.explanation).toEqual(saved);
      expect(generate).toHaveBeenCalledTimes(2);
      expect(transport.reserved).toBe(240);
      const serialized = [...checkpoints.records.values()]
        .map((record) => Buffer.from(record.checkpoint.base64, 'base64').toString('utf8'))
        .join('');
      expect(serialized).not.toContain(input.toolGrant);
      expect(serialized).not.toContain(input.checkpointGrant);
    },
  );
});
