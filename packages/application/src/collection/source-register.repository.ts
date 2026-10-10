import type { EnabledSourceView, SourceRegistration, SourceHold } from '@rei/domain';
import type { Transaction } from '../shared/index.js';

export const SOURCE_REGISTER_REPOSITORY = Symbol.for('rei.SourceRegisterRepository');

export interface SourceRegisterRepository {
  holdAtomically(
    sourceId: string,
    hold: SourceHold,
    signal?: AbortSignal,
  ): Promise<SourceRegistration | null>;
  clearHoldAfterReview(
    sourceId: string,
    reviewedAt: string,
    signal?: AbortSignal,
  ): Promise<SourceRegistration | null>;
  /** Holds a shared source lock until the page transaction ends. */
  assertCollectible(transaction: Transaction, sourceId: string): Promise<void>;
  findById(sourceId: string, signal?: AbortSignal): Promise<SourceRegistration | null>;
  enableAtomically(
    sourceId: string,
    enabledAt: string,
    signal?: AbortSignal,
  ): Promise<SourceRegistration | null>;
  listEnabled(signal?: AbortSignal): Promise<readonly EnabledSourceView[]>;
}
