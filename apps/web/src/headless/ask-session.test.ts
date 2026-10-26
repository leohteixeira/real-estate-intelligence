import { describe, expect, it } from 'vitest';
import { LiveAskSession } from './ask-session.js';
import {
  accepted,
  admitted,
  queued,
  running,
  paused,
  confirmed,
  resumed,
  completed,
  cancelled,
  failed,
  expired,
  threadId,
} from './ask-fixtures.test.js';

describe('live stream-owned evidence', () => {
  it('retains ordered progress through a confirmation returning to queued and explicit completion', () => {
    const session = new LiveAskSession(accepted);
    expect(session.run).toBeUndefined();
    expect(session.cursor).toBeUndefined();
    expect(session.terminal).toBe(false);
    for (const [index, run] of [queued, running, paused, confirmed, resumed, completed].entries())
      expect(session.admit(admitted(run, index + 1))).toBe(true);
    expect(session.run).toEqual(completed);
    expect(session.cursor).toBe(`${accepted.runId}:v1:6`);
    expect(session.terminal).toBe(true);
    expect(session.admit(admitted(completed, 6))).toBe(false);
    expect(() => session.admit(admitted(completed, 7))).toThrow();
  });
  it.each([completed, cancelled, failed, expired])(
    'accepts explicit terminal $state as its first retained frame',
    (run) => {
      const session = new LiveAskSession(accepted);
      session.admit(admitted(run, 1));
      expect(session.terminal).toBe(true);
    },
  );
  it('deduplicates only exact latest replay; changed or older frames fail closed', () => {
    const session = new LiveAskSession(accepted);
    session.admit(admitted(queued, 1));
    expect(session.admit(admitted(queued, 1))).toBe(false);
    expect(() => session.admit(admitted({ ...queued, question: 'changed' }, 1))).toThrow();
    session.admit(admitted(running, 2));
    expect(() => session.admit(admitted(queued, 1))).toThrow();
    expect(session.run).toEqual(running);
  });
  it.each([
    { ...running, id: threadId },
    { ...running, threadId: accepted.runId },
    { ...running, question: 'changed' },
    { ...running, locale: 'en' as const },
    { ...running, placeId: 'other' },
    { ...running, createdAt: '2026-10-26T11:00:00.000Z' },
    { ...running, originalInputs: null },
  ])('rejects changed immutable identity', (changed) => {
    const session = new LiveAskSession(accepted);
    session.admit(admitted(queued, 1));
    expect(() => session.admit(admitted(changed, 2))).toThrow();
    expect(session.cursor).toBe(`${accepted.runId}:v1:1`);
  });
  it('rejects gaps, mismatched serialization, basis and invalid public envelopes', () => {
    const session = new LiveAskSession(accepted);
    expect(() => session.admit(admitted(running, 2))).toThrow();
    const first = admitted(queued, 1);
    expect(() => session.admit({ ...first, serialized: '{}' })).toThrow();
    expect(() => session.admit({ ...first, frame: { ...first.frame, terminal: true } })).toThrow();
    expect(() =>
      session.admit(
        admitted({ ...queued, basis: 'routed-text-explanation-v1', explanation: null }, 1),
      ),
    ).toThrow();
  });
  it('rejects changed accepted decision, confirmation, deadline, steps and backwards time', () => {
    const session = new LiveAskSession(accepted);
    session.admit(admitted(paused, 1));
    const changed = {
      ...confirmed,
      decision: { ...confirmed.decision!, receiptId: threadId },
      confirmation: { ...confirmed.confirmation!, decisionReceiptId: threadId },
    };
    expect(() => session.admit(admitted(changed, 2))).toThrow();
    expect(() => session.admit(admitted(queued, 2))).toThrow();
    session.admit(admitted(confirmed, 2));
    expect(() =>
      session.admit(
        admitted({ ...resumed, confirmation: { ...resumed.confirmation!, inputs: null } }, 3),
      ),
    ).toThrow();
    expect(session.run).toEqual(confirmed);
  });
  it('protects retained evidence from input and snapshot mutation', () => {
    const session = new LiveAskSession(accepted);
    const first = admitted(queued, 1);
    session.admit(first);
    Object.assign(first.frame.run, { question: 'caller mutation' });
    const snapshot = session.run!;
    Object.assign(snapshot, { question: 'snapshot mutation' });
    expect(session.run?.question).not.toBe('caller mutation');
    expect(session.run?.question).not.toBe('snapshot mutation');
  });
});
