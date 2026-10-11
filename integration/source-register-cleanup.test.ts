import { describe, expect, it, test } from 'vitest';
import { coordinateSourceRegisterCleanup } from './source-register-cleanup.ts';

test('preserves explicitly caught undefined rather than declaring success', async () => {
  let success = false;
  await expect(
    coordinateSourceRegisterCleanup({
      primaryFailure: undefined,
      primaryThrown: true,
      close: async () => {},
      down: async () => {},
      onSuccess: async () => {
        success = true;
      },
    }),
  ).rejects.toBeUndefined();
  expect(success).toBe(false);
});

function fixture({
  primaryFailure,
  closeFailure,
  downFailure,
}: { primaryFailure?: unknown; closeFailure?: unknown; downFailure?: unknown } = {}) {
  const events: string[] = [];
  const run = () =>
    coordinateSourceRegisterCleanup({
      primaryFailure,
      close: async () => {
        events.push('close');
        if (closeFailure) throw closeFailure;
      },
      down: async () => {
        events.push('down');
        if (downFailure) throw downFailure;
      },
      onSuccess: async () => {
        events.push('success');
      },
    });

  return { events, run };
}
describe('source-register cleanup coordinator', () => {
  it('reports success only after both cleanup operations finish', async () => {
    const { events, run } = fixture();

    await run();

    expect(events).toStrictEqual(['close', 'down', 'success']);
  });

  it('fails on close failure, still runs down, and suppresses success', async () => {
    const closeFailure = new Error('close fault');
    const { events, run } = fixture({ closeFailure });

    await expect(run()).rejects.toSatisfy((error) => {
      expect(error.cause).toBe(closeFailure);
      return true;
    });
    expect(events).toStrictEqual(['close', 'down']);
  });

  it('fails on down failure after closing and suppresses success', async () => {
    const downFailure = new Error('down fault');
    const { events, run } = fixture({ downFailure });

    await expect(run()).rejects.toSatisfy((error) => {
      expect(error.cause).toBe(downFailure);
      return true;
    });
    expect(events).toStrictEqual(['close', 'down']);
  });

  it('aggregates both cleanup failures and suppresses success', async () => {
    const closeFailure = new Error('close fault');
    const downFailure = new Error('down fault');
    const { events, run } = fixture({ closeFailure, downFailure });

    await expect(run()).rejects.toSatisfy((error) => {
      expect(error instanceof AggregateError).toBeTruthy();
      expect(error.errors.map((failure: Error) => failure.cause)).toStrictEqual([
        closeFailure,
        downFailure,
      ]);
      return true;
    });
    expect(events).toStrictEqual(['close', 'down']);
  });

  it('preserves primary and cleanup failures together and suppresses success', async () => {
    const primaryFailure = new Error('assertion fault');
    const downFailure = new Error('down fault');
    const { events, run } = fixture({ primaryFailure, downFailure });

    await expect(run()).rejects.toSatisfy((error) => {
      expect(error instanceof AggregateError).toBeTruthy();
      expect(error.errors[0]).toBe(primaryFailure);
      expect(error.errors[1].cause).toBe(downFailure);
      return true;
    });
    expect(events).toStrictEqual(['close', 'down']);
  });
});
