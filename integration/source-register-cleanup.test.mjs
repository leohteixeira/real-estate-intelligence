import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { coordinateSourceRegisterCleanup } from './source-register-cleanup.mjs';

function fixture({ primaryFailure, closeFailure, downFailure } = {}) {
  const events = [];
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

    assert.deepEqual(events, ['close', 'down', 'success']);
  });

  it('fails on close failure, still runs down, and suppresses success', async () => {
    const closeFailure = new Error('close fault');
    const { events, run } = fixture({ closeFailure });

    await assert.rejects(run, (error) => {
      assert.equal(error.cause, closeFailure);
      return true;
    });
    assert.deepEqual(events, ['close', 'down']);
  });

  it('fails on down failure after closing and suppresses success', async () => {
    const downFailure = new Error('down fault');
    const { events, run } = fixture({ downFailure });

    await assert.rejects(run, (error) => {
      assert.equal(error.cause, downFailure);
      return true;
    });
    assert.deepEqual(events, ['close', 'down']);
  });

  it('aggregates both cleanup failures and suppresses success', async () => {
    const closeFailure = new Error('close fault');
    const downFailure = new Error('down fault');
    const { events, run } = fixture({ closeFailure, downFailure });

    await assert.rejects(run, (error) => {
      assert(error instanceof AggregateError);
      assert.deepEqual(
        error.errors.map((failure) => failure.cause),
        [closeFailure, downFailure],
      );
      return true;
    });
    assert.deepEqual(events, ['close', 'down']);
  });

  it('preserves primary and cleanup failures together and suppresses success', async () => {
    const primaryFailure = new Error('assertion fault');
    const downFailure = new Error('down fault');
    const { events, run } = fixture({ primaryFailure, downFailure });

    await assert.rejects(run, (error) => {
      assert(error instanceof AggregateError);
      assert.equal(error.errors[0], primaryFailure);
      assert.equal(error.errors[1].cause, downFailure);
      return true;
    });
    assert.deepEqual(events, ['close', 'down']);
  });
});
