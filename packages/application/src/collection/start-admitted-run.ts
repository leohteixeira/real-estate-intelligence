import type { CollectionRunState } from '@rei/domain';
import type { Clock, Transaction, UuidV7Generator } from '../shared/index.js';
import { ExternalFailure } from '../shared/index.js';
import type { CollectionRunRepository } from './collection-run.repository.js';

/** A retry keeps its original boundary; a new boundary is captured only after source admission. */
export function startAdmittedRun(
  transaction: Transaction,
  sourceId: string,
  operationKey: string,
  runs: CollectionRunRepository,
  identifiers: UuidV7Generator,
  clock: Clock,
  assertSource: () => Promise<void>,
  signal: AbortSignal,
): Promise<CollectionRunState> {
  return runs.withSourceAdmission(
    transaction,
    sourceId,
    async (frontier) => {
      signal.throwIfAborted();
      const retained = await runs.loadRunByOperationKeyInTransaction(transaction, operationKey);
      if (retained) {
        if (retained.sourceId !== sourceId)
          throw new ExternalFailure({ kind: 'rejected', operation: 'collection.run.resume' });
        return retained;
      }
      await assertSource();
      signal.throwIfAborted();
      const startedAt = clock.now();
      if (frontier && Date.parse(startedAt) < Date.parse(frontier.startedAt))
        throw new ExternalFailure({ kind: 'transient', operation: 'collection.run.admission' });
      // UUIDv7 generation can tie at millisecond precision across connections. Keep authentic
      // time while choosing a fresh identity that follows the already admitted canonical tuple.
      for (let attempt = 0; attempt < 32; attempt++) {
        signal.throwIfAborted();
        const runId = await identifiers.generate(transaction);
        if (
          frontier &&
          Date.parse(startedAt) === Date.parse(frontier.startedAt) &&
          runId <= frontier.runId
        )
          continue;
        return runs.startOrLoad(transaction, { operationKey, runId, sourceId, startedAt });
      }
      throw new ExternalFailure({ kind: 'transient', operation: 'collection.run.admission' });
    },
    signal,
  );
}
