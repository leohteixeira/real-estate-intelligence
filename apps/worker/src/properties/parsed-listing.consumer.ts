import { Inject, Injectable } from '@nestjs/common';
import {
  ConsumeParsedListing,
  EVENT_SUBSCRIBER,
  PARSED_LISTING_CONSUMER,
  type EventSubscriber,
} from '@rei/application';
import { COLLECTION_SNAPSHOT_PARSED_TYPE } from '@rei/domain';

@Injectable()
export class ParsedListingConsumer {
  public constructor(
    @Inject(EVENT_SUBSCRIBER) private readonly subscriber: EventSubscriber,
    @Inject(ConsumeParsedListing) private readonly service: ConsumeParsedListing,
  ) {}
  public async start(): Promise<void> {
    await this.subscriber.subscribe(
      { consumerName: PARSED_LISTING_CONSUMER, eventTypes: [COLLECTION_SNAPSHOT_PARSED_TYPE] },
      async (untrusted, delivery) => {
        await this.service.execute(untrusted, delivery.signal);
      },
    );
  }
}
