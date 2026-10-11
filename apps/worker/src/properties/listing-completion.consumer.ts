import { Inject, Injectable } from '@nestjs/common';
import {
  ConsumeListingCompletion,
  EVENT_SUBSCRIBER,
  LISTING_COMPLETION_CONSUMER,
  type EventSubscriber,
} from '@rei/application';
import { COLLECTION_RUN_COMPLETED_TYPE } from '@rei/domain';
@Injectable()
export class ListingCompletionConsumer {
  public constructor(
    @Inject(EVENT_SUBSCRIBER) private readonly subscriber: EventSubscriber,
    @Inject(ConsumeListingCompletion) private readonly service: ConsumeListingCompletion,
  ) {}
  public async start(): Promise<void> {
    await this.subscriber.subscribe(
      { consumerName: LISTING_COMPLETION_CONSUMER, eventTypes: [COLLECTION_RUN_COMPLETED_TYPE] },
      async (event, delivery) => this.service.execute(event, delivery.signal),
    );
  }
}
