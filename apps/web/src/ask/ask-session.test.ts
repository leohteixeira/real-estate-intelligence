import { describe, expect, it } from 'vitest';
import { AskSession } from './ask-session';
import { parseAskProgressEvent, parseAskRun } from '@rei/contracts';
import { completed, frames, queued, running, reorderMembers } from './ask-fixtures.test';

const record = (index: number) => ({
  frame: frames[index]!,
  serialized: JSON.stringify(frames[index]),
});
describe('Ask session admission and replay', () => {
  it('accepts public-parser-valid reordered nested identity and progressing step members', () => {
    const session = new AskSession(parseAskRun(queued));
    for (const [index, frame] of frames.entries()) {
      const reordered = parseAskProgressEvent(index === 1 ? frame : reorderMembers(frame));
      expect(session.admit({ frame: reordered, serialized: JSON.stringify(reordered) })).toBe(true);
    }
    expect(session.run).toEqual(completed);
  });
  it('accepts reordered decision/confirmation and rejects real nested changes', () => {
    const decision = { ...completed.decision!, confidence: 0.5, requiresConfirmation: true };
    const confirmation = {
      intent: 'price_per_square_meter',
      inputs: queued.originalInputs!,
      confirmedAt: completed.updatedAt,
      source: 'recorded-synthetic',
    } as const;
    const snapshot = parseAskRun({
      ...running,
      updatedAt: completed.updatedAt,
      decision,
      confirmation,
      steps: [
        running.steps[0],
        { sequence: 2, phase: 'awaiting_confirmation', at: completed.updatedAt },
        { sequence: 3, phase: 'confirmed', at: completed.updatedAt },
      ],
    });
    const session = new AskSession(snapshot);
    const first = parseAskProgressEvent({ ...frames[0], run: reorderMembers(snapshot) });
    expect(session.admit({ frame: first, serialized: JSON.stringify(first) })).toBe(true);
    const next = parseAskProgressEvent({ ...frames[1], run: snapshot });
    expect(session.admit({ frame: next, serialized: JSON.stringify(next) })).toBe(true);
    for (const run of [
      { ...snapshot, decision: { ...decision, confidence: 0.6 } },
      {
        ...snapshot,
        confirmation: { ...confirmation, inputs: { ...confirmation.inputs, areaSquareMeters: 81 } },
      },
      {
        ...snapshot,
        steps: snapshot.steps.map((step, index) =>
          index === 0 ? { ...step, at: snapshot.createdAt } : step,
        ),
      },
    ]) {
      const changed = parseAskProgressEvent({
        ...frames[2],
        event: 'ask.progress',
        terminal: false,
        run,
      });
      expect(() =>
        session.admit({ frame: changed, serialized: JSON.stringify(changed) }),
      ).toThrow();
    }
    expect(session.cursor).toBe(frames[1]!.id);
  });
  it('keeps contiguous snapshots and exact duplicates without duplicate announcements', () => {
    const session = new AskSession(queued);
    expect(session.admit(record(0))).toBe(true);
    expect(session.admit(record(0))).toBe(false);
    expect(session.cursor).toBe(frames[0]!.id);
    session.admit(record(1));
    session.admit(record(2));
    expect(session.run).toEqual(completed);
    expect(session.terminal).toBe(true);
    expect(session.admit(record(2))).toBe(false);
  });
  it.each([
    'question',
    'threadId',
    'placeId',
    'originalInputs',
    'basis',
    'metadata',
    'principalId',
    'locale',
    'createdAt',
  ] as const)('rejects changed immutable %s and retains last evidence', (field) => {
    const session = new AskSession(queued);
    session.admit(record(0));
    const bad = structuredClone(record(1));
    Reflect.set(bad.frame.run, field, 'foreign');
    expect(() => session.admit(bad)).toThrow();
    expect(session.run).toEqual(queued);
    expect(session.cursor).toBe(frames[0]!.id);
  });
  it('rejects conflicting duplicate bytes, gaps, reordering, rollback and post-terminal', () => {
    const session = new AskSession(queued);
    session.admit(record(0));
    expect(() => session.admit({ ...record(0), serialized: 'changed bytes' })).toThrow();
    expect(() => session.admit(record(2))).toThrow();
    session.admit(record(1));
    expect(() =>
      session.admit({ ...record(2), frame: { ...frames[2]!, run: { ...running, steps: [] } } }),
    ).toThrow();
    session.admit(record(2));
    expect(() =>
      session.admit({
        ...record(2),
        frame: { ...frames[2]!, sequence: 4, id: `${queued.id}:v1:4` },
      }),
    ).toThrow();
  });
});
