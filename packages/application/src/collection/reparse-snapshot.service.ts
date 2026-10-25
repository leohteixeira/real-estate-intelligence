import {
  CollectionSnapshotCorrected,
  CollectionSnapshotPerceptuallyCorrected,
  parseUuidV7,
  parseReparseLabel,
  parseCollectedListing,
  type TraceContext,
} from '@rei/domain';
import {
  ExternalFailure,
  type Clock,
  type OutboxAppendPort,
  type TransactionRunner,
  type UuidV7Generator,
} from '../shared/index.js';
import type { ListingSource } from './listing-source.port.js';
import type { SnapshotContentStore } from './raw-snapshot-store.port.js';
import type { SnapshotSanitizer } from './snapshot-sanitizer.port.js';
import type {
  SnapshotReparseRepository,
  SnapshotReparseResult,
} from './snapshot-reparse.repository.js';

/** Receives only parsing and reading capabilities; acquisition is unreachable. */
export class ReparseSnapshot {
  public constructor(
    private readonly parser: Pick<ListingSource, 'parse'>,
    private readonly reader: Pick<SnapshotContentStore, 'read'>,
    private readonly repository: SnapshotReparseRepository,
    private readonly transactions: TransactionRunner,
    private readonly identifiers: UuidV7Generator,
    private readonly clock: Clock,
    private readonly outbox: OutboxAppendPort,
    private readonly sanitizer?: SnapshotSanitizer,
  ) {}

  public async execute(
    snapshotIdInput: string,
    parserRevisionInput: string,
    operationKeyInput: string,
    traceContext: TraceContext | null,
    signal: AbortSignal,
    deadlineAt = Number.POSITIVE_INFINITY,
  ): Promise<SnapshotReparseResult> {
    const identity = {
      snapshotId: parseUuidV7(snapshotIdInput),
      parserRevision: parseReparseLabel(parserRevisionInput, 'parserRevision'),
      operationKey: parseReparseLabel(operationKeyInput, 'operationKey'),
    };
    const active = () => {
      if (signal.aborted)
        throw new ExternalFailure({ kind: 'cancelled', operation: 'collection.snapshot.reparse' });
      if (Date.now() >= deadlineAt)
        throw new ExternalFailure({ kind: 'exhausted', operation: 'collection.snapshot.reparse' });
    };
    active();
    const remaining = deadlineAt - Date.now();
    if (Number.isFinite(remaining))
      signal = AbortSignal.any([
        signal,
        AbortSignal.timeout(Math.min(2_147_483_647, Math.max(1, Math.ceil(remaining)))),
      ]);
    try {
      const existing = await this.repository.findOperation(identity.operationKey, signal);
      if (
        existing &&
        (existing.snapshotId !== identity.snapshotId ||
          existing.parserRevision !== identity.parserRevision)
      )
        throw new ExternalFailure({ kind: 'rejected', operation: 'collection.snapshot.reparse' });
      if (existing?.result) return { ...existing.result, replayed: true };
      const observation = await this.repository.findObservation(identity.snapshotId, signal);
      if (!observation)
        throw new ExternalFailure({ kind: 'rejected', operation: 'collection.snapshot.reparse' });
      const bytes = await this.reader.read(observation.objectKey, signal, deadlineAt);
      active();
      const fingerprints = this.repository.verifyOriginalBytes(observation, bytes);
      const reservation = await this.transactions.runInTransaction(
        (transaction) => this.repository.reserve(transaction, identity, observation, fingerprints),
        signal,
      );
      if (reservation.result) return { ...reservation.result, replayed: true };
      const document = {
        sourceId: observation.sourceId,
        sourceListingId: observation.sourceListingId,
        sourceUrl: observation.sourceUrl,
        observedAt: observation.observedAt,
        mediaType: observation.mediaType,
        bytes,
      };
      const sanitized = observation.synthetic ? null : this.sanitizer?.sanitize(document);
      if (!observation.synthetic && !sanitized)
        throw new ExternalFailure({ kind: 'forbidden', operation: 'collection.snapshot.reparse' });
      if (
        sanitized &&
        (sanitized.document.sourceUrl !== observation.sourceUrl ||
          sanitized.document.observedAt !== observation.observedAt)
      )
        throw new ExternalFailure({ kind: 'rejected', operation: 'collection.snapshot.reparse' });
      // Keep verified original bytes available to the parser; real data is already canonical and sanitized.
      let removeAbort = () => {};
      let parsed;
      try {
        parsed = await Promise.race([
          this.parser.parse(document, signal),
          new Promise<never>((_resolve, reject) => {
            const aborted = () => reject(signal.reason);
            signal.addEventListener('abort', aborted, { once: true });
            removeAbort = () => signal.removeEventListener('abort', aborted);
            if (signal.aborted) aborted();
          }),
        ]);
      } finally {
        removeAbort();
      }
      const trusted = { ...parsed, imageFingerprints: fingerprints };
      const listing =
        sanitized?.sanitizeParsed(trusted) ?? parseCollectedListing(trusted, true, true);
      active();
      return await this.transactions.runInTransaction(async (transaction) => {
        const locked = await this.repository.lockForCommit(transaction, identity);
        active();
        if (locked.result) return { ...locked.result, replayed: true };
        if (
          JSON.stringify(
            { ...locked.observation, imageFingerprints: null },
            Object.keys(locked.observation).sort(),
          ) !==
            JSON.stringify(
              { ...observation, imageFingerprints: null },
              Object.keys(observation).sort(),
            ) ||
          JSON.stringify(locked.observation.imageFingerprints) !== JSON.stringify(fingerprints)
        )
          throw new ExternalFailure({ kind: 'rejected', operation: 'collection.snapshot.reparse' });
        const eventId = await this.identifiers.generate(transaction);
        const Correction = fingerprints.some((item) => item.startsWith('dhash64-v1:'))
          ? CollectionSnapshotPerceptuallyCorrected
          : CollectionSnapshotCorrected;
        const event = new Correction({
          eventId,
          aggregateId: observation.snapshotId,
          occurredAt: this.clock.now(),
          traceContext,
          payload: {
            run: { runId: observation.runId },
            snapshot: { snapshotId: observation.snapshotId, contentHash: observation.contentHash },
            source: {
              sourceId: observation.sourceId,
              sourceListingId: observation.sourceListingId,
              sourceUrl: observation.sourceUrl,
              observedAt: observation.observedAt,
            },
            listing,
            correction: {
              kind: 'parser-correction',
              operationKey: identity.operationKey,
              parserRevision: identity.parserRevision,
              originalParsedEventId: observation.originalParsedEventId,
              order: locked.order,
            },
          },
        });
        const result = { ...identity, eventId, order: locked.order, replayed: false };
        await this.repository.complete(transaction, result);
        await this.repository.appendParsedEvidence(transaction, [event]);
        await this.outbox.append(transaction, [event]);
        active();
        return result;
      }, signal);
    } catch (error) {
      if (signal.aborted)
        throw new ExternalFailure({ kind: 'cancelled', operation: 'collection.snapshot.reparse' });
      if (error instanceof ExternalFailure) throw error;
      throw new ExternalFailure({ kind: 'rejected', operation: 'collection.snapshot.reparse' });
    }
  }
}
