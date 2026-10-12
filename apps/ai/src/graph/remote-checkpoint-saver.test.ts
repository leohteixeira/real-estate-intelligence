import { describe, expect, it, vi } from 'vitest';
import { emptyCheckpoint, uuid6 } from '@langchain/langgraph-checkpoint';
import { parseStructuredExecutionRequest } from '@rei/contracts';
import { RemoteCheckpointSaver, durablePriceInput } from './remote-checkpoint-saver';
import { checkpointFixture } from './checkpoint-test.fixture';
import { GraphCheckpointFailure } from './graph-checkpoint.port';
const id = '0199bd4a-1111-7111-8111-111111111111';
const input = parseStructuredExecutionRequest({
  version: 1,
  eventId: id,
  runId: id,
  threadId: id,
  executionId: id,
  step: 'structured-price-v1',
  query: 'Synthetic input',
  locale: 'en',
  toolGrant: 't'.repeat(43),
  checkpointGrant: 'c'.repeat(43),
  inputs: { priceMinorUnits: 10000, currency: 'BRL', areaSquareMeters: 2 },
});
const config = { configurable: { thread_id: id } };
function fixture() {
  const transport = checkpointFixture();
  const saver = new RemoteCheckpointSaver(
    input,
    transport,
    new AbortController().signal,
    Date.now() + 1000,
  );
  return { saver, transport };
}
describe('version-specific remote checkpoint saver', () => {
  it.each(['cancelled', 'deadline', 'prior-failure'] as const)(
    'bounds future-put rendezvous on %s without sending unknown writes',
    async (cause) => {
      vi.useFakeTimers();
      let release!: () => void;
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      const controller = new AbortController();
      const operations: string[] = [];
      const transport = checkpointFixture();
      const saver = new RemoteCheckpointSaver(
        input,
        {
          async execute(request, grant, signal, deadlineAt) {
            operations.push(request.operation);
            await barrier;
            if (cause === 'prior-failure') throw new GraphCheckpointFailure('transient');
            return transport.execute(request, grant, signal, deadlineAt);
          },
        },
        controller.signal,
        Date.now() + 1000,
      );
      const checkpoint = {
        ...emptyCheckpoint(),
        id: uuid6(-1),
        channel_values: { __start__: { input: durablePriceInput(input) } },
      };
      const put = saver.put(config, checkpoint, { source: 'input', step: -1, parents: {} }, {});
      const putOutcome = put.catch((error: unknown) => error);
      const futureId = uuid6(0);
      const writes = saver.putWrites(
        { configurable: { thread_id: id, checkpoint_id: futureId } },
        [['input', durablePriceInput(input)]],
        'task',
      );
      const outcome = writes.catch((error: unknown) => error);
      const second = saver
        .putWrites(
          { configurable: { thread_id: id, checkpoint_id: futureId } },
          [['input', durablePriceInput(input)]],
          'second-task',
        )
        .catch((error: unknown) => error);
      try {
        await vi.advanceTimersByTimeAsync(100);
        expect(operations).toEqual(['put']);
        if (cause === 'cancelled') controller.abort();
        else if (cause === 'deadline') await vi.advanceTimersByTimeAsync(900);
        else release();
        for (const result of await Promise.all([outcome, second]))
          expect(result).toMatchObject({
            kind: cause === 'prior-failure' ? 'transient' : 'cancelled',
          });
        expect(operations).toEqual(['put']);
      } finally {
        release();
        await putOutcome;
        vi.useRealTimers();
      }
    },
  );
  it.each(['get', 'list'] as const)(
    'recognizes an authorized %s tuple while an unrelated namespace put is active',
    async (operation) => {
      vi.useFakeTimers();
      let release!: () => void;
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      const transport = checkpointFixture();
      const controller = new AbortController();
      const checkpoint = {
        ...emptyCheckpoint(),
        id: uuid6(-1),
        channel_values: { __start__: { input: durablePriceInput(input) } },
      };
      const previous = new RemoteCheckpointSaver(
        input,
        transport,
        controller.signal,
        Date.now() + 1000,
      );
      const retained = await previous.put(
        config,
        checkpoint,
        { source: 'input', step: -1, parents: {} },
        {},
      );
      const saver = new RemoteCheckpointSaver(
        input,
        {
          async execute(request, grant, signal, deadlineAt) {
            if (request.operation === 'put') await barrier;
            return transport.execute(request, grant, signal, deadlineAt);
          },
        },
        controller.signal,
        Date.now() + 1000,
      );
      if (operation === 'get') expect(await saver.getTuple(retained)).toBeDefined();
      else expect((await saver.list(config).next()).value).toBeDefined();
      const unrelated = saver.put(
        { configurable: { thread_id: id, checkpoint_ns: 'other' } },
        { ...checkpoint, id: uuid6(0) },
        { source: 'input', step: -1, parents: {} },
        {},
      );
      let outcome = 'pending';
      const writes = saver
        .putWrites(retained, [['input', durablePriceInput(input)]], 'retained-task')
        .then(() => {
          outcome = 'saved';
        });
      const settled = writes.catch((error: unknown) => error);
      try {
        await vi.advanceTimersByTimeAsync(100);
        expect(outcome).toBe('saved');
      } finally {
        release();
        controller.abort();
        await Promise.allSettled([unrelated, settled]);
        vi.useRealTimers();
      }
    },
  );
  it('holds future-checkpoint writes while the SDK has not invoked its chained put yet', async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const transport = checkpointFixture();
    const operations: string[] = [];
    const saver = new RemoteCheckpointSaver(
      input,
      {
        async execute(request, grant, signal, deadlineAt) {
          operations.push(request.operation);
          if (request.operation === 'put' && request.parentId === null) await barrier;
          if (
            request.operation === 'put-writes' &&
            !transport.records.has(`${request.runId}:${request.namespace}:${request.checkpointId}`)
          )
            throw new GraphCheckpointFailure('rejected');
          return transport.execute(request, grant, signal, deadlineAt);
        },
      },
      new AbortController().signal,
      Date.now() + 1000,
    );
    const initial = {
      ...emptyCheckpoint(),
      id: uuid6(-1),
      channel_values: { __start__: { input: durablePriceInput(input) } },
    };
    const next = {
      ...initial,
      id: uuid6(0),
      channel_values: { input: durablePriceInput(input) },
    };
    const first = saver.put(config, initial, { source: 'input', step: -1, parents: {} }, {});
    // Match loop.js:358-362: the second saver.put is not called before the first ACK.
    const queued = first.then((saved) =>
      saver.put(saved, next, { source: 'loop', step: 0, parents: {} }, {}),
    );
    const writes = saver.putWrites(
      { configurable: { thread_id: id, checkpoint_id: next.id } },
      [['input', durablePriceInput(input)]],
      'task',
    );
    const outcome = writes.then(
      () => 'saved',
      (error: unknown) => error,
    );
    const secondWrites = saver.putWrites(
      { configurable: { thread_id: id, checkpoint_id: next.id } },
      [['input', durablePriceInput(input)]],
      'second-task',
    );
    const secondOutcome = secondWrites.catch((error: unknown) => error);
    try {
      await vi.advanceTimersByTimeAsync(100);
      expect(operations).toEqual(['put']);
      release();
      await queued;
      expect(await outcome).toBe('saved');
      expect(await secondOutcome).toBeUndefined();
      expect(operations).toEqual(['put', 'put', 'put-writes', 'put-writes']);
    } finally {
      release();
      await Promise.allSettled([queued, outcome, secondOutcome]);
      vi.useRealTimers();
    }
  });
  it('orders independently launched pending writes after their checkpoint acknowledgement', async () => {
    const transport = checkpointFixture();
    let release!: () => void;
    const committed = new Promise<void>((resolve) => {
      release = resolve;
    });
    const operations: string[] = [];
    const saver = new RemoteCheckpointSaver(
      input,
      {
        async execute(request, grant, signal, deadlineAt) {
          operations.push(request.operation);
          if (request.operation === 'put') await committed;
          return transport.execute(request, grant, signal, deadlineAt);
        },
      },
      new AbortController().signal,
      Date.now() + 1000,
    );
    const checkpoint = {
      ...emptyCheckpoint(),
      id: uuid6(-1),
      channel_values: { __start__: { input: durablePriceInput(input) } },
    };
    const pendingPut = saver.put(
      config,
      checkpoint,
      { source: 'input', step: -1, parents: {} },
      {},
    );
    const pendingWrites = saver.putWrites(
      { configurable: { thread_id: id, checkpoint_id: checkpoint.id } },
      [['input', durablePriceInput(input)]],
      'task',
    );
    await vi.waitFor(() => expect(operations).toEqual(['put']));
    release();
    await Promise.all([pendingPut, pendingWrites]);
    expect(operations).toEqual(['put', 'put-writes']);
    expect([...transport.records.values()][0]!.pendingWrites).toHaveLength(1);
  });
  it('roundtrips complete checkpoint, projected parent configuration and full pending writes in sequence', async () => {
    const { saver, transport } = fixture();
    const checkpoint = {
      ...emptyCheckpoint(),
      id: uuid6(-1),
      channel_values: { __start__: { input: durablePriceInput(input) } },
    };
    const first = await saver.put(
      { ...config, metadata: { private: 'must not persist' } },
      checkpoint,
      { source: 'input', step: -1, parents: {} },
      {},
    );
    await saver.putWrites(
      first,
      [
        ['input', durablePriceInput(input)],
        ['__error__', new Error('private secret')],
      ],
      'task',
    );
    const next = {
      ...checkpoint,
      id: uuid6(0),
      channel_values: { input: durablePriceInput(input) },
    };
    const second = await saver.put(
      first,
      next,
      { source: 'loop', step: 0, parents: {}, counters_since_delta_snapshot: { input: [1, 0] } },
      {},
    );
    // Immutable replay may acknowledge an older checkpoint but must retain its pending writes.
    await saver.put(config, checkpoint, { source: 'input', step: -1, parents: {} }, {});
    const tuple = await saver.getTuple(second);
    expect(tuple?.parentConfig).toEqual(first);
    expect(tuple?.checkpoint).toEqual(next);
    const firstTuple = await saver.getTuple(first);
    expect(firstTuple?.pendingWrites).toEqual([
      ['task', 'input', durablePriceInput(input)],
      ['task', '__error__', { name: 'Error', message: 'Execution unavailable.' }],
    ]);
    const listed = [];
    for await (const item of saver.list(config, { limit: 20 })) listed.push(item.checkpoint.id);
    expect(listed).toEqual([next.id, checkpoint.id]);
    const older = [];
    for await (const item of saver.list(config, { before: second, limit: 1 }))
      older.push(item.checkpoint.id);
    expect(older).toEqual([checkpoint.id]);
    expect(JSON.stringify([...transport.records.values()])).not.toContain('private');
    expect(JSON.stringify(first)).not.toContain('private');
  });
  it('refuses filters, deletion, foreign scope, malformed identities and canonical substitutions', async () => {
    const { saver } = fixture();
    expect(await saver.getTuple(config)).toBeUndefined();
    await expect(saver.deleteThread(id)).rejects.toMatchObject({ kind: 'rejected' });
    const filtered = saver.list(config, { filter: { source: 'loop' } });
    await expect(filtered.next()).rejects.toMatchObject({ kind: 'rejected' });
    for (const configurable of [
      { thread_id: '0199bd4a-1111-7111-8111-111111111112' },
      { thread_id: id, runId: 'foreign' },
      { thread_id: id, eventId: 'foreign' },
      { thread_id: id, executionId: 'foreign' },
      { thread_id: id, graphVersion: 'foreign' },
      { thread_id: id, checkpoint_ns: 42 },
      { thread_id: id, checkpoint_id: 42 },
      { thread_id: id, checkpoint_ns: '/unsafe' },
    ])
      await expect(saver.getTuple({ configurable })).rejects.toMatchObject({ kind: 'rejected' });
    await expect(
      saver
        .list(config, {
          before: { configurable: { thread_id: id, checkpoint_ns: 'foreign', checkpoint_id: id } },
        })
        .next(),
    ).rejects.toMatchObject({ kind: 'rejected' });
    for (const value of [
      null,
      [],
      { ...durablePriceInput(input), query: 'changed' },
      { ...durablePriceInput(input), executionId: id },
      { ...durablePriceInput(input), toolGrant: 'secret' },
      { ...durablePriceInput(input), inputs: { ...input.inputs, priceMinorUnits: 1 } },
    ])
      expect(() => saver.assertCanonical(value)).toThrow();
    await expect(
      saver.put(
        config,
        { ...emptyCheckpoint(), id: uuid6(0), channel_values: {} },
        { source: 'loop', step: 0, parents: {} },
        {},
      ),
    ).rejects.toMatchObject({ kind: 'rejected' });
    await expect(
      saver.putWrites(config, [['input', durablePriceInput(input)]], 'task'),
    ).rejects.toMatchObject({ kind: 'rejected' });
    await expect(
      saver.put(
        config,
        { ...emptyCheckpoint(), id: uuid6(0), channel_values: { input: durablePriceInput(input) } },
        { source: 'fork', step: 0, parents: {} },
        {},
      ),
    ).rejects.toMatchObject({ kind: 'rejected' });
  });
  it('rejects corrupt serialized saved state and response-operation confusion', async () => {
    const { saver, transport } = fixture();
    const checkpoint = {
      ...emptyCheckpoint(),
      id: uuid6(0),
      channel_values: { input: durablePriceInput(input) },
    };
    const saved = await saver.put(config, checkpoint, { source: 'loop', step: 0, parents: {} }, {});
    const record = [...transport.records.values()][0]!;
    transport.records.set(`${input.runId}::${record.checkpointId}`, {
      ...record,
      checkpoint: { type: 'json', base64: Buffer.from('invalid JSON').toString('base64') },
    });
    await expect(saver.getTuple(saved)).rejects.toMatchObject({ kind: 'rejected' });
    const confused = new RemoteCheckpointSaver(
      input,
      { execute: async () => ({ operation: 'put', saved: true }) },
      new AbortController().signal,
      Date.now() + 1000,
    );
    await expect(confused.getTuple(config)).rejects.toMatchObject({ kind: 'rejected' });
    await expect(confused.list(config).next()).rejects.toMatchObject({ kind: 'rejected' });
  });
  it('never calls remote after cancellation or for oversized pending state', async () => {
    const execute = vi.fn();
    const aborted = new RemoteCheckpointSaver(
      input,
      { execute },
      AbortSignal.abort(),
      Date.now() + 1000,
    );
    await expect(aborted.getTuple(config)).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
    const { saver } = fixture();
    const checkpoint = {
      ...emptyCheckpoint(),
      id: uuid6(0),
      channel_values: { input: durablePriceInput(input) },
    };
    const saved = await saver.put(config, checkpoint, { source: 'loop', step: 0, parents: {} }, {});
    await expect(
      saver.putWrites(saved, [['huge', 'x'.repeat(262145)]], 'task'),
    ).rejects.toMatchObject({ kind: 'rejected' });
  });
});
