import { describe, expect, it, vi } from 'vitest';
import type { CollectedListing, UuidV7 } from '@rei/domain';
import { ReparseSnapshot } from './reparse-snapshot.service.js';
import type {
  SnapshotReparseRepository,
  ReparseObservation,
} from './snapshot-reparse.repository.js';
import type { Transaction } from '../shared/index.js';

const snapshotId = '0199c8f2-2394-7ba0-8f9e-286378779211' as UuidV7;
const original: ReparseObservation = {
  snapshotId,
  runId: '0199c8f2-2394-7ba0-8f9e-286378779210' as UuidV7,
  originalParsedEventId: '0199c8f2-2394-7ba0-8f9e-286378779212' as UuidV7,
  sourceId: 'synthetic-data',
  sourceListingId: 'fixture-1',
  sourceUrl: 'https://synthetic.invalid/listings/fixture-1',
  observedAt: '2026-10-10T00:00:00.000Z',
  contentHash: `sha256:${'1'.repeat(64)}`,
  objectKey: `synthetic/sha256/${'1'.repeat(64)}.json`,
  mediaType: 'application/json',
  byteLength: 2,
  synthetic: true,
  imageFingerprints: [],
};
const listing: CollectedListing = {
  propertyType: 'apartment',
  askingPriceMinorUnits: 100,
  currency: 'BRL',
  areaSquareMeters: 50,
  bedrooms: 1,
  bathrooms: 1,
  parkingSpaces: 0,
  features: [],
  location: { city: 'City', stateCode: 'SP', neighborhood: 'District', street: 'Street' },
  listedAt: '2026-10-10T00:00:00.000Z',
  advertiser: { type: 'private', agencyName: null },
  maskedDescription: 'Corrected listing.',
  imageFingerprints: ['invented'],
};
function fixture() {
  const transaction = {} as Transaction;
  const repository: SnapshotReparseRepository = {
    appendParsedEvidence: vi.fn(async () => undefined),
    findOperation: vi.fn(async () => null),
    findObservation: vi.fn(async () => original),
    verifyOriginalBytes: vi.fn(() => []),
    reserve: vi.fn(async () => ({ result: null })),
    lockForCommit: vi.fn(async () => ({ observation: original, order: 1, result: null })),
    complete: vi.fn(async () => undefined),
  };
  const parser = { parse: vi.fn(async () => listing) };
  const reader = { read: vi.fn(async () => new TextEncoder().encode('{}')) };
  const outbox = { append: vi.fn(async () => undefined) };
  const service = new ReparseSnapshot(
    parser,
    reader,
    repository,
    { runInTransaction: async (work) => work(transaction) },
    { generate: async () => '0199c8f2-2394-7ba0-8f9e-286378779213' as UuidV7 },
    { now: () => '2026-10-10T01:00:00.000Z' },
    outbox,
  );
  return { service, repository, parser, reader, outbox };
}
describe('ReparseSnapshot', () => {
  it('publishes only a v2 correction with identical provenance and trusted empty fingerprints', async () => {
    const f = fixture();
    const result = await f.service.execute(
      snapshotId,
      'parser-v2',
      'operation-1',
      null,
      new AbortController().signal,
    );
    const event = f.outbox.append.mock.calls[0]![1][0]!;
    expect(f.repository.appendParsedEvidence).toHaveBeenCalledWith(expect.anything(), [event]);
    expect(f.repository.complete).toHaveBeenCalledBefore(
      f.repository.appendParsedEvidence as never,
    );
    expect(f.repository.appendParsedEvidence).toHaveBeenCalledBefore(f.outbox.append as never);
    expect(event.version).toBe(2);
    expect(event.payload).toMatchObject({
      run: { runId: original.runId },
      source: { observedAt: original.observedAt },
      listing: { imageFingerprints: [] },
      correction: {
        kind: 'parser-correction',
        originalParsedEventId: original.originalParsedEventId,
        order: 1,
      },
    });
    expect(result.replayed).toBe(false);
    expect(f.parser.parse).toHaveBeenCalledOnce();
  });
  it('returns durable replay before accessing bytes or parsing', async () => {
    const f = fixture();
    const result = await f.service.execute(
      snapshotId,
      'parser-v2',
      'operation-1',
      null,
      new AbortController().signal,
    );
    vi.mocked(f.repository.findOperation).mockResolvedValue({
      snapshotId,
      parserRevision: 'parser-v2',
      result,
    });
    f.reader.read.mockClear();
    f.parser.parse.mockClear();
    expect(
      (
        await f.service.execute(
          snapshotId,
          'parser-v2',
          'operation-1',
          null,
          new AbortController().signal,
        )
      ).replayed,
    ).toBe(true);
    expect(f.reader.read).not.toHaveBeenCalled();
    expect(f.parser.parse).not.toHaveBeenCalled();
    await expect(
      f.service.execute(
        snapshotId,
        'other-revision',
        'operation-1',
        null,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ kind: 'rejected' });
  });
  it.each([
    'missing',
    'corrupt',
    'read-failure',
    'parse-failure',
    'expired-commit',
    'outbox-failure',
  ])('fails closed for %s', async (scenario) => {
    const f = fixture();
    if (scenario === 'missing') vi.mocked(f.repository.findObservation).mockResolvedValue(null);
    if (scenario === 'corrupt')
      vi.mocked(f.repository.verifyOriginalBytes).mockImplementation(() => {
        throw new Error('Corrupt');
      });
    if (scenario === 'read-failure') f.reader.read.mockRejectedValue(new Error('Unavailable'));
    if (scenario === 'parse-failure') f.parser.parse.mockRejectedValue(new Error('Parser failed'));
    if (scenario === 'expired-commit')
      vi.mocked(f.repository.lockForCommit).mockRejectedValue(new Error('Expired'));
    if (scenario === 'outbox-failure') f.outbox.append.mockRejectedValue(new Error('SQL failed'));
    await expect(
      f.service.execute(snapshotId, 'parser-v2', 'operation-1', null, new AbortController().signal),
    ).rejects.toBeDefined();
    if (scenario !== 'outbox-failure') expect(f.outbox.append).not.toHaveBeenCalled();
  });
  it('checks cancellation and elapsed deadlines before commit', async () => {
    const f = fixture();
    await expect(
      f.service.execute(
        snapshotId,
        'parser-v2',
        'operation-1',
        null,
        AbortSignal.abort(new Error('private cancellation reason')),
      ),
    ).rejects.toMatchObject({ kind: 'cancelled' });
    expect(f.repository.findOperation).not.toHaveBeenCalled();
    const abort = new AbortController();
    f.parser.parse.mockImplementation(async () => {
      abort.abort();
      return listing;
    });
    await expect(
      f.service.execute(snapshotId, 'parser-v2', 'operation-1', null, abort.signal),
    ).rejects.toBeDefined();
    expect(f.outbox.append).not.toHaveBeenCalled();
    await expect(
      f.service.execute(
        snapshotId,
        'parser-v2',
        'operation-1',
        null,
        new AbortController().signal,
        1,
      ),
    ).rejects.toMatchObject({ kind: 'exhausted' });
  });
  it('reattaches original evidence even when the changed parser omits the field', async () => {
    const f = fixture();
    const changed = { ...listing };
    delete (changed as Partial<CollectedListing>).imageFingerprints;
    f.parser.parse.mockResolvedValue(changed);
    await f.service.execute(
      snapshotId,
      'parser-v2',
      'missing-field',
      null,
      new AbortController().signal,
    );
    expect(f.outbox.append.mock.calls[0]![1][0]!.payload.listing.imageFingerprints).toEqual([]);
  });
  it('bounds an uncooperative parser and redacts its failure payload', async () => {
    const f = fixture();
    // Node's native AbortSignal.timeout is not driven by Vitest fake timers.
    // Control that boundary and wait for parser entry before advancing expiry.
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date('2026-10-12T00:00:00.000Z'));
    const deadline = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation((milliseconds) => {
      setTimeout(() => deadline.abort(new DOMException('Expired', 'TimeoutError')), milliseconds);
      return deadline.signal;
    });
    try {
      let entered = () => {};
      const parserEntered = new Promise<void>((resolve) => {
        entered = resolve;
      });
      f.parser.parse.mockImplementation(() => {
        entered();
        return new Promise(() => {});
      });
      const execution = f.service.execute(
        snapshotId,
        'parser-v2',
        'deadline',
        null,
        new AbortController().signal,
        Date.now() + 20,
      );
      const cancelled = expect(execution).rejects.toMatchObject({ kind: 'cancelled' });
      await parserEntered;
      expect(f.parser.parse).toHaveBeenCalledOnce();
      expect(timeout).toHaveBeenCalledExactlyOnceWith(20);
      expect(deadline.signal.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(19);
      expect(deadline.signal.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await cancelled;
      expect(deadline.signal.aborted).toBe(true);
      expect(f.outbox.append).not.toHaveBeenCalled();
      f.parser.parse.mockRejectedValue(new Error('private@example.test secret-token'));
      const failure = f.service.execute(
        snapshotId,
        'parser-v2',
        'failure',
        null,
        new AbortController().signal,
      );
      await expect(failure).rejects.toMatchObject({ kind: 'rejected' });
      await expect(failure).rejects.not.toThrow('private@example.test');
      await expect(failure).rejects.not.toThrow('secret-token');
    } finally {
      timeout.mockRestore();
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });
  it('rejects original provenance mutation under commit lock', async () => {
    const f = fixture();
    vi.mocked(f.repository.lockForCommit).mockResolvedValue({
      observation: { ...original, sourceListingId: 'changed' },
      order: 1,
      result: null,
    });
    await expect(
      f.service.execute(snapshotId, 'parser-v2', 'mutation', null, new AbortController().signal),
    ).rejects.toMatchObject({ kind: 'rejected' });
    expect(f.outbox.append).not.toHaveBeenCalled();
  });
  it.each(['reservation', 'commit'])(
    'returns the concurrent winner at %s without another event',
    async (phase) => {
      const f = fixture();
      const result = {
        snapshotId,
        parserRevision: 'parser-v2',
        operationKey: 'race',
        eventId: original.originalParsedEventId,
        order: 7,
        replayed: false,
      };
      if (phase === 'reservation') vi.mocked(f.repository.reserve).mockResolvedValue({ result });
      else
        vi.mocked(f.repository.lockForCommit).mockResolvedValue({
          observation: original,
          order: 7,
          result,
        });
      expect(
        await f.service.execute(
          snapshotId,
          'parser-v2',
          'race',
          null,
          new AbortController().signal,
        ),
      ).toEqual({ ...result, replayed: true });
      expect(f.outbox.append).not.toHaveBeenCalled();
      if (phase === 'reservation') expect(f.parser.parse).not.toHaveBeenCalled();
    },
  );
});
