import { describe, expect, it } from 'vitest';
import { parseAskProgressEvent } from './ask.sse.dto.js';

const id = '0199c8f2-2394-7000-8000-000000000001';
const metadata = {
  fixtureVersion: 'ask-v1',
  asOf: '2026-10-11T12:00:10.000Z',
  synthetic: true,
  liveExecution: false,
  durableReplay: false,
};
const run = {
  basis: 'prepared-ask-example',
  metadata,
  id,
  threadId: id,
  principalId: null,
  question: 'Synthetic question',
  locale: 'en',
  placeId: null,
  state: 'queued',
  createdAt: '2026-10-11T12:00:00.000Z',
  updatedAt: '2026-10-11T12:00:00.000Z',
  originalInputs: null,
  decision: null,
  confirmation: null,
  result: null,
  terminal: null,
  steps: [],
};
const frame = {
  basis: 'prepared-ask-example',
  metadata,
  version: 1,
  id: `${id}:v1:1`,
  runId: id,
  sequence: 1,
  event: 'ask.progress',
  terminal: false,
  run,
};
describe('version-1 Ask SSE public envelopes', () => {
  it('round-trips explicit stable event IDs and strictly scoped progress', () => {
    expect(parseAskProgressEvent(JSON.parse(JSON.stringify(frame)))).toEqual(frame);
    for (const patch of [
      { version: 2 },
      { id: '1' },
      { sequence: 0 },
      { sequence: 2 },
      { event: 'error' },
      { event: 'ask.completed' },
      { terminal: true },
      { runId: id.replace('000001', '000002') },
      { metadata: { ...metadata, asOf: '2026-10-11T12:00:09.000Z' } },
      { capability: 'private' },
    ])
      expect(() => parseAskProgressEvent({ ...frame, ...patch })).toThrow(
        'Invalid contract value.',
      );
  });
  it('requires explicit matching terminal events and categorical safe failures', () => {
    const at = run.updatedAt;
    const terminal = {
      ...frame,
      event: 'ask.failed',
      terminal: true,
      run: {
        ...run,
        state: 'failed',
        terminal: { state: 'failed', reason: 'preview_unavailable', at },
        steps: [{ sequence: 1, phase: 'failed', at }],
      },
    };
    expect(parseAskProgressEvent(terminal).event).toBe('ask.failed');
    expect(() => parseAskProgressEvent({ ...terminal, terminal: false })).toThrow(TypeError);
    expect(() =>
      parseAskProgressEvent({
        ...terminal,
        run: {
          ...terminal.run,
          terminal: { ...terminal.run.terminal, reason: 'provider key abc' },
        },
      }),
    ).toThrow(TypeError);
  });
  it('rejects terminal step phases hidden inside nonterminal running progress', () => {
    const running = { ...run, state: 'running' };
    expect(parseAskProgressEvent({ ...frame, run: running }).terminal).toBe(false);
    for (const phase of ['completed', 'failed', 'cancelled', 'expired']) {
      expect(() =>
        parseAskProgressEvent({
          ...frame,
          run: { ...running, steps: [{ sequence: 1, phase, at: running.updatedAt }] },
        }),
      ).toThrow('Invalid contract value.');
    }
  });
});
