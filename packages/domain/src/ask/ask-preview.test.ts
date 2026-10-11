import { describe, expect, it } from 'vitest';
import { askEventId, assertAskPreview, isAskTerminal } from './ask-preview.js';
import type { AskProgressEvent, AskRun } from './ask-read.types.js';

const runId = '0199c8f2-2394-7000-8000-000000000001';
const metadata = {
  fixtureVersion: 'ask-v1',
  asOf: '2026-10-11T12:00:10.000Z',
  synthetic: true,
  liveExecution: false,
  durableReplay: false,
} as const;
const queued: AskRun = {
  basis: 'prepared-ask-example',
  metadata,
  id: runId,
  threadId: runId,
  principalId: null,
  question: 'Synthetic question',
  locale: 'en',
  placeId: null,
  createdAt: '2026-10-11T12:00:00.000Z',
  updatedAt: '2026-10-11T12:00:00.000Z',
  state: 'queued',
  originalInputs: null,
  decision: null,
  confirmation: null,
  result: null,
  terminal: null,
  steps: [],
};
function frame(run: AskRun, sequence: number): AskProgressEvent {
  const terminal = isAskTerminal(run.state);
  return {
    basis: 'prepared-ask-example',
    metadata,
    version: 1,
    id: askEventId(runId, sequence),
    runId,
    sequence,
    event: terminal ? `ask.${run.state}` : 'ask.progress',
    terminal,
    run,
  };
}
const running: AskRun = { ...queued, state: 'running', updatedAt: '2026-10-11T12:00:01.000Z' };
const completed: AskRun = {
  ...running,
  state: 'completed',
  updatedAt: '2026-10-11T12:00:02.000Z',
  result: { kind: 'unavailable_intent', reason: 'not_available' },
  terminal: { state: 'completed', reason: null, at: '2026-10-11T12:00:02.000Z' },
};

describe('Ask preview invariants', () => {
  it('recognizes exactly the four terminal states', () => {
    expect(['queued', 'running', 'awaiting_confirmation'].map(isAskTerminal)).toEqual([
      false,
      false,
      false,
    ]);
    expect(['completed', 'failed', 'cancelled', 'expired'].map(isAskTerminal)).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });
  it('has stable versioned run-scoped event IDs', () => {
    expect(askEventId('0199c8f2-2394-7000-8000-000000000001', 2)).toBe(
      '0199c8f2-2394-7000-8000-000000000001:v1:2',
    );
  });
  it('rejects an empty preview rather than claiming physical completion', () => {
    expect(() => assertAskPreview([])).toThrow('Invalid Ask preview.');
  });
  it('requires ordered run-scoped transitions, immutable snapshot identity and exactly one explicit terminal', () => {
    const preview = [frame(queued, 1), frame(running, 2), frame(completed, 3)];
    expect(() => assertAskPreview(preview)).not.toThrow();
    for (const patch of [
      { sequence: 9 },
      { id: 'generated-id' },
      { version: 2 },
      { runId: 'foreign' },
      { event: 'ask.failed' },
      { terminal: true },
      { run: { ...running, state: 'queued' } },
      { run: { ...running, question: 'changed caller text' } },
      { run: { ...running, updatedAt: '2026-10-10T00:00:00.000Z' } },
      { run: { ...running, terminal: completed.terminal } },
      { run: { ...running, result: completed.result } },
      {
        run: {
          ...running,
          originalInputs: { priceMinorUnits: 1, currency: 'BRL', areaSquareMeters: 1 },
        },
      },
    ])
      expect(() =>
        assertAskPreview([
          preview[0]!,
          { ...preview[1], ...patch } as AskProgressEvent,
          preview[2]!,
        ]),
      ).toThrow('Invalid Ask preview.');
    expect(() => assertAskPreview(preview.slice(0, 2))).toThrow(TypeError);
    expect(() => assertAskPreview([...preview, frame(completed, 4)])).toThrow(TypeError);
    expect(() => assertAskPreview([frame({ ...completed, result: null }, 1)])).toThrow(TypeError);
  });
});
