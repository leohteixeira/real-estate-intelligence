import { afterAll, describe, expect, test } from 'vitest';
import { accessibilitySteps } from './accessibility-steps.ts';

describe.sequential('native fixture lifecycle', () => {
  const execution = accessibilitySteps();
  const events: string[] = [];
  test('preparation', () =>
    execution.start(async (checkpoint) => {
      events.push('setup');
      await expect.poll(() => events.includes('setup')).toBe(true);
      try {
        await checkpoint('held', async () => {
          await expect.poll(() => events.at(-1)).toBe('setup');
          events.push('held');
        });
        await expect.poll(() => events.at(-1)).toBe('held');
        events.push('retry');
        await checkpoint('recovered', async () => {
          await expect.poll(() => events.at(-1)).toBe('retry');
          events.push('recovered');
        });
        await expect.poll(() => events.at(-1)).toBe('recovered');
        events.push('SQL');
      } finally {
        events.push('cleanup');
      }
    }));
  test('held state', async () => {
    await execution.advance('held');
    expect(events).toEqual(['setup', 'held']);
  });
  test('recovery state', async () => {
    await execution.advance('recovered');
    expect(events).toEqual(['setup', 'held', 'retry', 'recovered']);
  });
  test('boundaries and cleanup', async () => {
    await execution.finish();
    expect(events).toEqual(['setup', 'held', 'retry', 'recovered', 'SQL', 'cleanup']);
  });
  afterAll(() => execution.finish());
});

test('native states share preparation and pause transitions until the next test starts', async () => {
  const execution = accessibilitySteps();
  const events: string[] = [];
  await execution.start(async (checkpoint) => {
    events.push('setup');
    try {
      await checkpoint('loading', async () => {
        events.push('audit loading');
      });
      events.push('manual recovery');
      await checkpoint('recovered', async () => {
        events.push('audit recovered');
      });
      events.push('SQL boundary');
    } finally {
      events.push('owned cleanup');
    }
  });
  expect(events).toEqual(['setup']);
  await execution.advance('loading');
  expect(events).toEqual(['setup', 'audit loading']);
  await execution.advance('recovered');
  expect(events).toEqual(['setup', 'audit loading', 'manual recovery', 'audit recovered']);
  await execution.finish();
  expect(events).toEqual([
    'setup',
    'audit loading',
    'manual recovery',
    'audit recovered',
    'SQL boundary',
    'owned cleanup',
  ]);
});

test('an assertion failure propagates to its native test and preserves cleanup failure', async () => {
  const execution = accessibilitySteps();
  const assertion = new Error('focus control missing');
  const cleanup = new Error('owned teardown failed');
  await execution.start(async (checkpoint) => {
    try {
      await checkpoint('open', async () => {
        throw assertion;
      });
    } catch (error) {
      throw new AggregateError([error, cleanup], 'audit and cleanup failed', { cause: error });
    }
  });
  await expect(execution.advance('open')).rejects.toBe(assertion);
  await expect(execution.finish()).rejects.toMatchObject({ errors: [assertion, cleanup] });
});

test('missing, reordered and undeclared states cannot produce successful completion', async () => {
  const missing = accessibilitySteps();
  await expect(missing.start(async () => undefined)).rejects.toThrow('no declared state');

  const reordered = accessibilitySteps();
  let cleaned = false;
  await reordered.start(async (checkpoint) => {
    try {
      await checkpoint('unexpected', async () => undefined);
    } finally {
      cleaned = true;
    }
  });
  await expect(reordered.advance('expected')).rejects.toThrow('received unexpected');
  expect(cleaned).toBe(true);
  await expect(reordered.finish()).rejects.toThrow('received unexpected');

  const extra = accessibilitySteps();
  await extra.start(async (checkpoint) => {
    await checkpoint('first', async () => undefined);
    await checkpoint('undeclared', async () => undefined);
  });
  await extra.advance('first');
  await expect(extra.finish()).rejects.toThrow('Unexecuted accessibility state: undeclared');

  const absent = accessibilitySteps();
  await absent.start(async (checkpoint) => {
    await checkpoint('first', async () => undefined);
  });
  await absent.advance('first');
  await expect(absent.advance('missing')).rejects.toThrow(
    'Missing declared accessibility state: missing',
  );
  await absent.finish();
});

test('preparation and final boundary failures stay visible', async () => {
  const preparation = accessibilitySteps();
  const failure = new Error('database unavailable');
  await expect(
    preparation.start(async () => {
      throw failure;
    }),
  ).rejects.toBe(failure);
  await expect(preparation.finish()).rejects.toBe(failure);

  const boundary = accessibilitySteps();
  await boundary.start(async (checkpoint) => {
    await checkpoint('state', async () => undefined);
    throw failure;
  });
  await boundary.advance('state');
  await expect(boundary.finish()).rejects.toBe(failure);
});
