import { Inject, Injectable } from '@nestjs/common';
import {
  ConsumeListingSuppression,
  EVENT_SUBSCRIBER,
  LISTING_SUPPRESSION_CONSUMER,
  type EventSubscriber,
} from '@rei/application';
import { COLLECTION_LISTING_SUPPRESSED_TYPE } from '@rei/domain';
@Injectable()
export class ListingSuppressionConsumer {
  public constructor(
    @Inject(EVENT_SUBSCRIBER) private readonly subscriber: EventSubscriber,
    @Inject(ConsumeListingSuppression) private readonly service: ConsumeListingSuppression,
  ) {}
  public async start(): Promise<void> {
    await this.subscriber.subscribe(
      {
        consumerName: LISTING_SUPPRESSION_CONSUMER,
        eventTypes: [COLLECTION_LISTING_SUPPRESSED_TYPE],
      },
      async (event, delivery) => this.service.execute(event, delivery.signal),
    );
  }
}
