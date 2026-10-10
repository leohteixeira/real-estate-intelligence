import type { DomainEventEnvelope, EventPayload, UuidV7 } from '@rei/domain';

import type { Transaction } from './transaction.js';

/** Stable event shape used at the application and persistence boundaries. */
export type EventEnvelope<
  TType extends string = string,
  TPayload extends object = EventPayload,
> = DomainEventEnvelope<TType, TPayload>;

/** Application-level outbox record; the PostgreSQL table is defined by a later story. */
export interface OutboxRow<
  TType extends string = string,
  TPayload extends object = EventPayload,
> extends DomainEventEnvelope<TType, TPayload> {
  readonly publishedAt: string | null;
  readonly claimId: UuidV7;
  readonly claimExpiresAt: string;
}

/** Appends events using the same transaction that persisted the aggregate. */
export interface OutboxAppendPort {
  append(transaction: Transaction, events: readonly EventEnvelope[]): Promise<void>;
}

export interface OutboxRelayPort {
  claimPending(limit: number, leaseDurationMs: number): Promise<readonly OutboxRow[]>;
  markPublished(eventId: UuidV7, claimId: UuidV7): Promise<void>;
  releaseClaim(eventId: UuidV7, claimId: UuidV7): Promise<void>;
}

/** Bounded maintenance capability for delivery rows that are no longer replayable. */
export interface OutboxRetentionPort {
  prunePublished(retentionMs: number, batchSize: number, signal: AbortSignal): Promise<number>;
}

export const OUTBOX_APPEND_PORT = Symbol.for('rei.OutboxAppendPort');
export const OUTBOX_RELAY_PORT = Symbol.for('rei.OutboxRelayPort');
export const OUTBOX_RETENTION_PORT = Symbol.for('rei.OutboxRetentionPort');
