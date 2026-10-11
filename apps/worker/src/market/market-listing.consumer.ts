import { Inject, Injectable } from '@nestjs/common';
import {
  ConsumeMarketListing,
  EVENT_SUBSCRIBER,
  MARKET_LISTING_CONSUMER,
  MARKET_LISTING_EVENT_TYPES,
  type EventSubscriber,
} from '@rei/application';

@Injectable()
export class MarketListingConsumer {
  public constructor(
    @Inject(EVENT_SUBSCRIBER) private readonly subscriber: EventSubscriber,
    @Inject(ConsumeMarketListing) private readonly service: ConsumeMarketListing,
  ) {}
  public async start(): Promise<void> {
    await this.subscriber.subscribe(
      { consumerName: MARKET_LISTING_CONSUMER, eventTypes: MARKET_LISTING_EVENT_TYPES },
      (event, delivery) => this.service.execute(event, delivery.signal),
    );
  }
}
