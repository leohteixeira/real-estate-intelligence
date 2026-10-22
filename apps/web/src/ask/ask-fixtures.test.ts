import { expect, it } from 'vitest';
import { parseAskProgressEvent, type AskRun } from '@rei/contracts';

export const runId = '0199c8f2-2394-7000-8000-000000000001';
export const threadId = '0199c8f2-2394-7000-8000-000000000101';
export const metadata = {
  fixtureVersion: 'ask-v1',
  asOf: '2026-10-11T12:00:10.000Z',
  synthetic: true,
  liveExecution: false,
  durableReplay: false,
} as const;
export const queued: AskRun = {
  basis: 'prepared-ask-example',
  metadata,
  id: runId,
  threadId,
  principalId: null,
  question: 'What is the asking price per square meter for this synthetic apartment?',
  locale: 'en',
  placeId: null,
  createdAt: '2026-10-11T12:00:00.000Z',
  updatedAt: '2026-10-11T12:00:00.000Z',
  state: 'queued',
  originalInputs: { priceMinorUnits: 80000000, currency: 'BRL', areaSquareMeters: 80 },
  decision: null,
  confirmation: null,
  result: null,
  terminal: null,
  steps: [],
};
export const running: AskRun = {
  ...queued,
  state: 'running',
  updatedAt: '2026-10-11T12:00:01.000Z',
  steps: [{ sequence: 1, phase: 'interpreting', at: '2026-10-11T12:00:01.000Z' }],
};
export const completed: AskRun = {
  ...running,
  state: 'completed',
  updatedAt: '2026-10-11T12:00:02.000Z',
  decision: {
    intent: 'price_per_square_meter',
    confidence: 0.98,
    degraded: false,
    requiresConfirmation: false,
    source: 'synthetic-fixture',
    decidedAt: '2026-10-11T12:00:02.000Z',
  },
  result: {
    kind: 'price_per_square_meter',
    minorUnits: 1000000,
    currency: 'BRL',
    areaUnit: 'm2',
    inputs: queued.originalInputs!,
    computedAt: '2026-10-11T12:00:02.000Z',
  },
  terminal: { state: 'completed', reason: null, at: '2026-10-11T12:00:02.000Z' },
  steps: [
    ...running.steps,
    { sequence: 2, phase: 'calculating', at: '2026-10-11T12:00:02.000Z' },
    { sequence: 3, phase: 'completed', at: '2026-10-11T12:00:02.000Z' },
  ],
};
export const prior: AskRun = {
  ...queued,
  id: '0199c8f2-2394-7000-8000-000000000201',
  question: 'Can this fixture predict a future sale price?',
  originalInputs: null,
  createdAt: '2026-10-11T11:59:00.000Z',
  updatedAt: '2026-10-11T11:59:01.000Z',
  state: 'completed',
  decision: {
    intent: 'unavailable',
    confidence: 0.99,
    degraded: false,
    requiresConfirmation: false,
    source: 'synthetic-fixture',
    decidedAt: '2026-10-11T11:59:00.000Z',
  },
  result: { kind: 'unavailable_intent', reason: 'not_available' },
  terminal: { state: 'completed', reason: null, at: '2026-10-11T11:59:01.000Z' },
  steps: [{ sequence: 1, phase: 'completed', at: '2026-10-11T11:59:01.000Z' }],
};
export const frames = [queued, running, completed].map((run, index) =>
  parseAskProgressEvent({
    basis: 'prepared-ask-example',
    metadata,
    version: 1,
    id: `${runId}:v1:${index + 1}`,
    runId,
    sequence: index + 1,
    event: index === 2 ? 'ask.completed' : 'ask.progress',
    terminal: index === 2,
    run,
  }),
);
export function wire(index: number, newline = '\n'): string {
  const frame = frames[index]!;
  return [
    `id: ${frame.id}`,
    `event: ${frame.event}`,
    `data: ${JSON.stringify(frame)}`,
    '',
    '',
  ].join(newline);
}
/** Separately serialized equivalent JSON, including every nested object. Arrays keep their order. */
export function reorderMembers(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item: unknown) => reorderMembers(item));
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, item]: [string, unknown]) => [key, reorderMembers(item)]),
    );
  return value;
}
it('uses prepared fixtures admitted by the strict public parser', () => {
  expect(frames.map((frame) => frame.run.state)).toEqual(['queued', 'running', 'completed']);
});
