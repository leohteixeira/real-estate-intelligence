import { AuditTraceRequested, type UuidV7 } from '@rei/domain';

import type {
  Clock,
  OutboxAppendPort,
  TransactionRunner,
  UuidV7Generator,
} from '../shared/index.js';

export class RequestAuditTrace {
  public constructor(
    private readonly transactions: TransactionRunner,
    private readonly identifiers: UuidV7Generator,
    private readonly clock: Clock,
    private readonly outbox: OutboxAppendPort,
  ) {}

  public async execute(): Promise<UuidV7> {
    return this.transactions.runInTransaction(async (transaction) => {
      const eventId = await this.identifiers.generate(transaction);
      const aggregateId = await this.identifiers.generate(transaction);
      const event = new AuditTraceRequested({
        eventId,
        aggregateId,
        occurredAt: this.clock.now(),
      });

      await this.outbox.append(transaction, [event]);
      return event.eventId;
    });
  }
}
