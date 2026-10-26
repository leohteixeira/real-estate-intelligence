import { expect, it } from 'vitest';
import {
  askIntents,
  parseAskLiveEvent,
  parseRoutedAskLiveRun,
  type AskLiveRun,
  type RoutedAskAccepted,
} from '@rei/contracts';

export const runId = '019aaaaa-1234-7123-8123-123456789abc';
export const threadId = '019bbbbb-1234-7123-8123-123456789abc';
export const receiptId = '019ccccc-1234-7123-8123-123456789abc';
export const capability = 'a'.repeat(43);
export const key = 'headless-test-'.repeat(3);
export const signal = () => new AbortController().signal;
export const inputs = { priceMinorUnits: 78500000, currency: 'BRL' as const, areaSquareMeters: 68 };
export const edited = { ...inputs, priceMinorUnits: 68000000 };
export const input = {
  mode: 'routed-text-v1' as const,
  threadId: null,
  placeId: null,
  query: 'Preço por m² de BRL 785.000,00 e 68 m² uncertain',
  locale: 'pt-BR' as const,
};
export const accepted: RoutedAskAccepted = { mode: input.mode, runId, threadId, state: 'queued' };
const at = (second: number) => `2026-10-26T12:00:0${second}.000Z`;
export const queued = parseRoutedAskLiveRun({
  basis: input.mode,
  id: runId,
  threadId,
  principalId: null,
  question: input.query,
  locale: input.locale,
  placeId: null,
  createdAt: at(0),
  updatedAt: at(0),
  state: 'queued',
  originalInputs: inputs,
  decision: null,
  confirmation: null,
  confirmationDeadline: null,
  result: null,
  terminal: null,
  steps: [],
});
export const running = parseRoutedAskLiveRun({
  ...queued,
  state: 'running',
  updatedAt: at(1),
  steps: [{ sequence: 1, phase: 'routing', at: at(1) }],
});
export const paused = parseRoutedAskLiveRun({
  ...running,
  state: 'awaiting_confirmation',
  updatedAt: at(2),
  decision: {
    intent: 'price_per_square_meter',
    probability: 0.84,
    probabilities: Object.fromEntries(
      askIntents.map((intent) => [intent, intent === 'price_per_square_meter' ? 0.84 : 0.032]),
    ),
    source: 'heuristic-v1',
    degraded: true,
    taxonomyVersion: 'ask-intents-v1',
    privacyEvidenceId: null,
    receiptId,
    acceptedAt: at(2),
  },
  confirmationDeadline: '2026-10-26T12:10:02.000Z',
  steps: [...running.steps, { sequence: 2, phase: 'awaiting_confirmation', at: at(2) }],
});
export const confirmed = parseRoutedAskLiveRun({
  ...paused,
  state: 'queued',
  updatedAt: at(3),
  confirmation: { decisionReceiptId: receiptId, inputs: edited, at: at(3) },
  steps: [...paused.steps, { sequence: 3, phase: 'confirmed', at: at(3) }],
});
export const resumed = parseRoutedAskLiveRun({ ...confirmed, state: 'running', updatedAt: at(4) });
export const completed = parseRoutedAskLiveRun({
  ...resumed,
  state: 'completed',
  updatedAt: at(5),
  result: {
    kind: 'price_per_square_meter',
    minorUnits: 1000000,
    currency: 'BRL',
    areaUnit: 'm2',
    inputs: edited,
    computedAt: at(5),
  },
  terminal: { state: 'completed', reason: null, at: at(5) },
  steps: [...resumed.steps, { sequence: 4, phase: 'completed', at: at(5) }],
});
export const cancelled = parseRoutedAskLiveRun({
  ...paused,
  state: 'cancelled',
  updatedAt: at(3),
  terminal: { state: 'cancelled', reason: 'visitor_cancelled', at: at(3) },
  steps: [...paused.steps, { sequence: 3, phase: 'cancelled', at: at(3) }],
});
export const failed = parseRoutedAskLiveRun({
  ...running,
  state: 'failed',
  updatedAt: at(2),
  terminal: { state: 'failed', reason: 'execution_unavailable', at: at(2) },
  steps: [...running.steps, { sequence: 2, phase: 'failed', at: at(2) }],
});
export const expired = parseRoutedAskLiveRun({
  ...queued,
  state: 'expired',
  updatedAt: at(1),
  terminal: { state: 'expired', reason: 'queue_expired', at: at(1) },
  steps: [{ sequence: 1, phase: 'expired', at: at(1) }],
});
export function frame(run: AskLiveRun, sequence: number) {
  return parseAskLiveEvent({
    version: 1,
    id: `${run.id}:v1:${sequence}`,
    runId: run.id,
    sequence,
    event: run.terminal ? `ask.${run.state}` : 'ask.progress',
    terminal: run.terminal !== null,
    run: structuredClone(run),
  });
}
export function admitted(run: AskLiveRun, sequence: number) {
  const value = frame(run, sequence);
  return { frame: value, serialized: JSON.stringify(value) };
}
export const wire = (run: AskLiveRun, sequence: number) => {
  const { frame: value, serialized } = admitted(run, sequence);
  return `id: ${value.id}\nevent: ${value.event}\ndata: ${serialized}\n\n`;
};
export const stream = (text: string) =>
  new Response(text, { headers: { 'content-type': 'text/event-stream; charset=utf-8' } });

it('uses strict live public fixtures', () => expect(frame(completed, 6).terminal).toBe(true));
