import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  AUDIT_EVENT_LOG,
  LISTING_SUPPRESSION,
  type ListingSuppressionAuthority,
  EVENT_SUBSCRIBER,
  INBOX,
  TRANSACTION_RUNNER,
  type AuditEventLog,
  type EventSubscriber,
  type Inbox,
  type TransactionRunner,
} from '@rei/application';
import {
  COLLECTION_RUN_COMPLETED_TYPE,
  COLLECTION_SNAPSHOT_PARSED_TYPE,
  COLLECTION_LISTING_SUPPRESSED_TYPE,
  parseCollectionEvent,
} from '@rei/domain';

export const COLLECTION_AUDIT_CONSUMER = 'audit.collection-events';

@Injectable()
export class CollectionAuditConsumer {
  public constructor(
    @Inject(EVENT_SUBSCRIBER) private readonly subscriber: EventSubscriber,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
    @Inject(INBOX) private readonly inbox: Inbox,
    @Inject(AUDIT_EVENT_LOG) private readonly auditLog: AuditEventLog,
    @Optional()
    @Inject(LISTING_SUPPRESSION)
    private readonly suppression?: ListingSuppressionAuthority,
  ) {}

  public async start(): Promise<void> {
    await this.subscriber.subscribe(
      {
        consumerName: COLLECTION_AUDIT_CONSUMER,
        eventTypes: [
          COLLECTION_SNAPSHOT_PARSED_TYPE,
          COLLECTION_RUN_COMPLETED_TYPE,
          COLLECTION_LISTING_SUPPRESSED_TYPE,
        ],
      },
      async (event) => {
        await this.transactions.runInTransaction(async (transaction) => {
          const firstDelivery = await this.inbox.record(
            transaction,
            COLLECTION_AUDIT_CONSUMER,
            event.eventId,
          );
          if (firstDelivery) {
            if (event.type === COLLECTION_SNAPSHOT_PARSED_TYPE && this.suppression) {
              const parsed = parseCollectionEvent(event);
              if (
                parsed.type === COLLECTION_SNAPSHOT_PARSED_TYPE &&
                (await this.suppression.lockAndCheck(transaction, parsed.payload.source))
              )
                return;
            }
            await this.auditLog.append(transaction, event);
          }
        });
      },
    );
  }
}
