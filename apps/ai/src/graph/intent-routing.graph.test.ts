import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import {
  parseRoutedExecutionInput,
  parseIntentDecisionReceipt,
  type IntentDecisionReceipt,
  type RoutedAskLiveRun,
  type PriceToolRequest,
} from '@rei/contracts';
import { ReceiptModelExplainer } from '../models/receipt-model-explainer';
import { acknowledged, modelTransportFixture } from '../models/model-test.fixture';
import type { LanguageModelRequest } from '../models/language-model.port';
import type { ModelExplainer } from '../models/model-explanation.port';
import { checkpointFixture } from './checkpoint-test.fixture';
import { PriceGraphFactory } from './price-graph.factory';
import { ExecutionService } from '../execution/execution.service';
import { compileNoOpGraph } from './no-op.graph';
import { heuristicDecision } from '../models/intent-decider';
import type { IntentDecisionTransport } from '../models/intent-decision.transport';
const input = parseRoutedExecutionInput({
  version: 1,
  eventId: '0199c8f2-2394-7ba0-8f9e-286378779212',
  runId: '0199c8f2-2394-7ba0-8f9e-286378779210',
  threadId: '0199c8f2-2394-7ba0-8f9e-286378779211',
  executionId: '0199c8f2-2394-7ba0-8f9e-286378779213',
  step: 'routed-text-v1',
  query: 'Calculate price per square meter.',
  locale: 'en',
  toolGrant: 'g'.repeat(43),
  checkpointGrant: 'c'.repeat(43),
  inputs: { priceMinorUnits: 78500000, currency: 'BRL', areaSquareMeters: 68 },
});
function fixture(probability: number, model?: ModelExplainer) {
  const checkpoints = checkpointFixture();
  let decision: IntentDecisionReceipt | null = null;
  let confirmation: RoutedAskLiveRun['confirmation'] = null;
  let loseAccept = false;
  const decider = {
    decide: vi.fn(async () => {
      const found = heuristicDecision(input.query);
      return {
        ...found,
        probability,
        probabilities: {
          ...found.probabilities,
          price_per_square_meter: probability,
          unsupported: found.probabilities.unsupported + 0.9 - probability,
        },
      };
    }),
  };
  const transport: IntentDecisionTransport = {
    async execute(request) {
      if (request.operation === 'get') return { operation: 'get', decision, confirmation };
      if (request.operation === 'reserve')
        return { operation: 'reserve', reservationId: input.runId };
      decision = parseIntentDecisionReceipt({
        ...request.decision,
        receiptId: input.runId,
        acceptedAt: '2026-10-26T00:00:00.000Z',
      });
      if (loseAccept) {
        loseAccept = false;
        throw new Error('Lost receipt acknowledgement.');
      }
      return { operation: 'accept', decision };
    },
  };
  const calculate = vi.fn(async (request: PriceToolRequest) => ({
    ...request,
    receiptId: input.runId,
    provenance: 'market-domain-v1' as const,
    result: {
      kind: 'price_per_square_meter' as const,
      minorUnits: Math.round(request.inputs.priceMinorUnits / request.inputs.areaSquareMeters),
      currency: 'BRL' as const,
      areaUnit: 'm2' as const,
      inputs: request.inputs,
      computedAt: '2026-10-26T00:00:01.000Z',
    },
  }));
  const service = () =>
    new ExecutionService(
      compileNoOpGraph(),
      new PriceGraphFactory({ calculate }, checkpoints, model, decider, transport),
    );
  return {
    service,
    decider,
    calculate,
    checkpoints,
    confirm() {
      confirmation = {
        decisionReceiptId: input.runId,
        inputs: { ...input.inputs!, areaSquareMeters: 100 },
        at: '2026-10-26T00:00:02.000Z',
      };
    },
    loseAccept() {
      loseAccept = true;
    },
  };
}
describe('routed graph receipt and confidence boundaries', () => {
  it.each([0.85, 0.849999])(
    'honors probability %s and resumes durable interrupts without a second classification',
    async (probability) => {
      const f = fixture(probability);
      const result = await f.service().execute(input, new AbortController().signal);
      expect(result.step).toBe('routed-text-v1');
      if (result.step !== 'routed-text-v1') throw new Error();
      expect(result.outcome).toBe(
        probability >= 0.85 ? 'price-calculated' : 'awaiting-confirmation',
      );
      expect(f.calculate).toHaveBeenCalledTimes(probability >= 0.85 ? 1 : 0);
      if (probability < 0.85) {
        expect(
          await f
            .service()
            .execute(
              { ...input, executionId: '0199c8f2-2394-7ba0-8f9e-286378779214' },
              new AbortController().signal,
            ),
        ).toMatchObject({ outcome: 'awaiting-confirmation' });
        expect(f.calculate).not.toHaveBeenCalled();
        f.confirm();
        const resumed = await f
          .service()
          .execute(
            { ...input, executionId: '0199c8f2-2394-7ba0-8f9e-286378779215' },
            new AbortController().signal,
          );
        expect(resumed).toMatchObject({
          outcome: 'price-calculated',
          receipt: { result: { minorUnits: 785000 } },
        });
        expect(f.calculate).toHaveBeenCalledOnce();
      }
      expect(f.decider.decide).toHaveBeenCalledOnce();
      const bytes = [...f.checkpoints.records.values()]
        .map((record) => Buffer.from(record.checkpoint.base64, 'base64').toString('utf8'))
        .join('');
      expect(bytes).not.toContain(input.toolGrant);
      expect(bytes).not.toContain(input.checkpointGrant);
      expect(bytes).toContain('"decision"');
    },
  );
  it('recovers an accepted decision after its acknowledgement is lost before checkpointing', async () => {
    const f = fixture(0.85);
    f.loseAccept();
    await expect(f.service().execute(input, new AbortController().signal)).rejects.toThrow();
    expect(
      await f
        .service()
        .execute(
          { ...input, executionId: '0199c8f2-2394-7ba0-8f9e-286378779215' },
          new AbortController().signal,
        ),
    ).toMatchObject({ outcome: 'price-calculated' });
    expect(f.decider.decide).toHaveBeenCalledOnce();
    expect(f.calculate).toHaveBeenCalledOnce();
  });
  it('rejects an invalid returned decision without executing or accepting it', async () => {
    const f = fixture(0.85);
    f.decider.decide.mockResolvedValue({ ...heuristicDecision(input.query), probability: NaN });
    await expect(f.service().execute(input, new AbortController().signal)).rejects.toThrow(
      BadRequestException,
    );
    expect(f.calculate).not.toHaveBeenCalled();
    expect(f.decider.decide).toHaveBeenCalledOnce();
    const bytes = [...f.checkpoints.records.values()]
      .map((record) => Buffer.from(record.checkpoint.base64, 'base64').toString('utf8'))
      .join('');
    expect(bytes).not.toContain('"receiptId"');
  });
  it('retains a decision with missing operands and performs no price effect', async () => {
    const f = fixture(0.85);
    expect(
      await f.service().execute({ ...input, inputs: null }, new AbortController().signal),
    ).toMatchObject({ outcome: 'execution-unavailable', decisionReceiptId: input.runId });
    expect(f.calculate).not.toHaveBeenCalled();
    expect(f.decider.decide).toHaveBeenCalledOnce();
  });
});

describe('combined routing and explanation', () => {
  it.each([0.85, 0.84])(
    'explains only after the authorized confidence gate at %s and reuses accepted work',
    async (probability) => {
      const transport = modelTransportFixture();
      const generate = vi.fn(async (request: LanguageModelRequest) =>
        acknowledged(
          request.model,
          request.prompt === 'Return the single public word: ready.'
            ? 'ready'
            : request.prompt.split('\n').slice(-3).reverse().join(' '),
          request.prompt === 'Return the single public word: ready.' ? 1 : 32,
        ),
      );
      const model = new ReceiptModelExplainer({ generate }, transport);
      const f = fixture(probability, model);
      const combined = parseRoutedExecutionInput({
        ...input,
        step: 'routed-text-explanation-v1',
        admittedAt: '2026-10-26T00:00:00.000Z',
        queueDurationMs: 17,
      });
      if (combined.step !== 'routed-text-explanation-v1')
        throw new Error('Expected combined execution.');
      const result = await f.service().execute(combined, new AbortController().signal);
      if (probability < 0.85) {
        expect(result).toMatchObject({ outcome: 'awaiting-confirmation' });
        expect(generate).not.toHaveBeenCalled();
        f.confirm();
      }
      const completed =
        probability >= 0.85
          ? result
          : await f
              .service()
              .execute(
                { ...combined, executionId: '0199c8f2-2394-7ba0-8f9e-286378779215' },
                new AbortController().signal,
              );
      expect(completed).toMatchObject({
        step: 'routed-text-explanation-v1',
        outcome: 'price-calculated',
        explanation: { authorship: 'model-written' },
      });
      expect(generate).toHaveBeenCalledTimes(2);
      const budget = transport.reserved;
      const recovered = await f
        .service()
        .execute(
          { ...combined, queueDurationMs: 0, executionId: '0199c8f2-2394-7ba0-8f9e-286378779216' },
          new AbortController().signal,
        );
      expect(recovered).toMatchObject({
        outcome: 'price-calculated',
        explanation: transport.accepted,
      });
      expect(transport.reserved).toBe(budget);
      for (const record of f.checkpoints.records.values())
        expect(Buffer.from(record.checkpoint.base64, 'base64').toString()).not.toContain(
          'queueDurationMs',
        );
      expect(generate).toHaveBeenCalledTimes(2);
      expect(f.decider.decide).toHaveBeenCalledOnce();
    },
  );
  it('does not generate for a recognized unavailable intent', async () => {
    const explain = vi.fn();
    const f = fixture(0.85, { explain });
    f.decider.decide.mockResolvedValue(heuristicDecision('Find property listings'));
    expect(
      await f.service().execute(
        parseRoutedExecutionInput({
          ...input,
          step: 'routed-text-explanation-v1',
          admittedAt: '2026-10-26T00:00:00.000Z',
          queueDurationMs: 17,
        }),
        new AbortController().signal,
      ),
    ).toMatchObject({ outcome: 'execution-unavailable' });
    expect(f.calculate).not.toHaveBeenCalled();
    expect(explain).not.toHaveBeenCalled();
  });
});
