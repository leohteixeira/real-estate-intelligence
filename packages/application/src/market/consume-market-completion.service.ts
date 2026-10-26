import { parseCollectionRunCompleted } from '@rei/domain';
import type { Inbox, TransactionRunner } from '../shared/index.js';
import type { MarketCompletionProjectionPort } from './market-price-facts.port.js';

export const MARKET_COMPLETION_CONSUMER = 'market.source-completion';
export class ConsumeMarketCompletion {
  public constructor(
    private readonly completions: MarketCompletionProjectionPort,
    private readonly transactions: TransactionRunner,
    private readonly inbox: Inbox,
  ) {}
  public async execute(untrusted: unknown, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    const event = parseCollectionRunCompleted(untrusted);
    await this.transactions.runInTransaction(async (transaction) => {
      await this.completions.complete(transaction, event.payload.sourceId, event.occurredAt);
      signal.throwIfAborted();
      await this.inbox.record(transaction, MARKET_COMPLETION_CONSUMER, event.eventId);
      signal.throwIfAborted();
    }, signal);
  }
}
