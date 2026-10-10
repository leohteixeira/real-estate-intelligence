import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_EVENT_LOG,
  EVENT_SUBSCRIBER,
  INBOX,
  TRANSACTION_RUNNER,
  type AuditEventLog,
  type EventSubscriber,
  type Inbox,
  type TransactionRunner,
} from '@rei/application';
import { AUDIT_TRACE_REQUESTED_TYPE } from '@rei/domain';

@Injectable()
export class AuditTraceConsumer {
  public constructor(
    @Inject(EVENT_SUBSCRIBER) private readonly subscriber: EventSubscriber,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
    @Inject(INBOX) private readonly inbox: Inbox,
    @Inject(AUDIT_EVENT_LOG) private readonly auditLog: AuditEventLog,
  ) {}

  public async start(): Promise<void> {
    await this.subscriber.subscribe(
      { consumerName: 'audit.event-log', eventTypes: [AUDIT_TRACE_REQUESTED_TYPE] },
      async (event) => {
        await this.transactions.runInTransaction(async (transaction) => {
          const firstDelivery = await this.inbox.record(
            transaction,
            'audit.event-log',
            event.eventId,
          );
          if (firstDelivery) {
            await this.auditLog.append(transaction, event);
          }
        });
      },
    );
  }
}
